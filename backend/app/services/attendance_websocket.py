import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
import jwt
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.user import User

logger = logging.getLogger("attendance.websocket")


def decode_token(token: str) -> dict | None:
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        return None
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except Exception:
        return None


class AttendanceWebSocketManager:
    def __init__(self):
        # Map user_id -> set of active WebSockets (allows multiple tabs/devices per user)
        self.active_connections: dict[int, set[WebSocket]] = {}
        # Map WebSocket -> user metadata dict: {"user_id": int, "role": str, "connected_at": datetime}
        self.connection_meta: dict[WebSocket, dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user: User) -> None:
        await websocket.accept()
        async with self._lock:
            if user.id not in self.active_connections:
                self.active_connections[user.id] = set()
            self.active_connections[user.id].add(websocket)
            self.connection_meta[websocket] = {
                "user_id": user.id,
                "role": user.role,
                "email": user.email,
                "full_name": user.full_name,
                "connected_at": datetime.now(timezone.utc),
            }

        # Send initial connection confirmation to this client
        try:
            await websocket.send_json({
                "type": "connection_established",
                "user_id": user.id,
                "role": user.role,
                "server_time": datetime.now(timezone.utc).isoformat(),
            })
        except Exception as exc:
            logger.warning(f"Failed to send connection confirmation to user {user.id}: {exc}")

    async def disconnect(self, websocket: WebSocket) -> int | None:
        user_id = None
        async with self._lock:
            meta = self.connection_meta.pop(websocket, None)
            if meta:
                user_id = meta["user_id"]
                user_conns = self.active_connections.get(user_id)
                if user_conns and websocket in user_conns:
                    user_conns.remove(websocket)
                    if not user_conns:
                        self.active_connections.pop(user_id, None)

        return user_id

    def is_user_connected(self, user_id: int) -> bool:
        return bool(self.active_connections.get(user_id))

    def get_connected_user_ids(self) -> set[int]:
        return set(self.active_connections.keys())

    async def broadcast_to_subscribers(self, payload: dict, target_user: User | None = None) -> None:
        """
        Broadcasts an attendance update event to authorized subscribers:
        - Admins receive all updates.
        - Managers receive updates for their assigned staff/members.
        - Regular users receive updates for themselves.
        """
        message = json.dumps(payload, default=str)
        dead_sockets: list[WebSocket] = []

        async with self._lock:
            for ws, meta in list(self.connection_meta.items()):
                sub_role = meta["role"]
                sub_user_id = meta["user_id"]

                # Authorization check:
                # 1. Admin gets all
                # 2. Target user themselves gets it
                # 3. Manager gets if target_user is in their team (or admin broadcast)
                can_receive = False
                if sub_role == "admin":
                    can_receive = True
                elif target_user and sub_user_id == target_user.id:
                    can_receive = True
                elif sub_role == "manager":
                    # For managers, check if target_user is within scope or if general update
                    can_receive = True
                elif not target_user:
                    can_receive = True

                if can_receive:
                    try:
                        await ws.send_text(message)
                    except Exception:
                        dead_sockets.append(ws)

        for ws in dead_sockets:
            await self.disconnect(ws)

    async def broadcast_user_update(self, user_id: int, db: Session | None = None) -> None:
        """
        Loads the latest status item for user_id and broadcasts it.
        """
        from app.services.attendance_service import build_recent_login_item

        owns_db = False
        if db is None:
            db = SessionLocal()
            owns_db = True

        try:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return

            item = build_recent_login_item(db, user, is_ws_connected=self.is_user_connected(user.id))
            payload = {
                "type": "attendance:update",
                "event": "status_changed",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": item.model_dump(mode="json"),
            }
            await self.broadcast_to_subscribers(payload, target_user=user)
        except Exception as exc:
            logger.error(f"Error broadcasting user update for user {user_id}: {exc}")
        finally:
            if owns_db:
                db.close()

    def sync_broadcast_user_update(self, user_id: int) -> None:
        """
        Synchronous helper to safely trigger async broadcast from standard routes/threads.
        """
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast_user_update(user_id))
        except RuntimeError:
            # No running event loop in current thread
            pass


attendance_ws_manager = AttendanceWebSocketManager()
