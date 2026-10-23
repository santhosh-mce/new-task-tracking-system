import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models.attendance import AttendanceBreak, AttendanceSession, DailyAttendance
from app.models.user import User
from app.routers.attendance import get_recent_logins
from app.schemas.attendance import RecentLoginStaffItem
from app.security import create_access_token
from app.services.attendance_service import (
    build_recent_login_item,
    check_in_user,
    check_out_user,
    end_break,
    get_default_policy,
    start_break,
    utc_now,
)
from app.services.attendance_websocket import attendance_ws_manager


class TestRealtimeAttendanceAndWebSockets(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        # Find or create a test staff user
        self.admin = self.db.query(User).filter(User.role == "admin").first()
        self.staff_user = (
            self.db.query(User)
            .filter(User.role.in_(("employee", "intern")), User.status == "active")
            .first()
        )
        if not self.staff_user:
            self.staff_user = User(
                full_name="Test Attendance Staff",
                email="test.attendance.staff@ingage.biz",
                role="employee",
                status="active",
                current_status="Offline",
            )
            self.db.add(self.staff_user)
            self.db.commit()
            self.db.refresh(self.staff_user)

    def tearDown(self):
        self.db.close()

    def test_check_in_creates_realtime_session(self):
        user = self.staff_user
        session, daily = check_in_user(self.db, user, source="web_test")
        self.assertIsNotNone(session.id)
        self.assertIsNone(session.check_out)
        self.assertEqual(session.session_status, "Online")
        self.assertIsNotNone(session.last_heartbeat)

        self.db.refresh(user)
        self.assertEqual(user.current_status, "Online")
        self.assertIsNotNone(user.last_login_at)

        # Build recent login item and assert schema fields
        item = build_recent_login_item(self.db, user)
        self.assertIsInstance(item, RecentLoginStaffItem)
        self.assertEqual(item.current_status, "Online")
        self.assertTrue(item.is_active_session)
        self.assertFalse(item.is_on_break)
        self.assertGreaterEqual(item.session_duration_seconds, 0)
        self.assertEqual(item.break_duration_seconds, 0)
        self.assertIsNotNone(item.last_activity)

    def test_break_lifecycle_transitions(self):
        user = self.staff_user
        # Ensure checked in
        check_in_user(self.db, user, source="web_test")

        # 1. Start break
        brk = start_break(self.db, user, break_type="Tea Break", reason="Quick coffee")
        self.assertIsNotNone(brk.id)
        self.assertIsNone(brk.end_time)

        self.db.refresh(user)
        self.assertEqual(user.current_status, "On Break")

        item_on_break = build_recent_login_item(self.db, user)
        self.assertEqual(item_on_break.current_status, "On Break")
        self.assertTrue(item_on_break.is_on_break)
        self.assertIsNotNone(item_on_break.active_break_start)

        # 2. End break
        ended = end_break(self.db, user)
        self.assertIsNotNone(ended)
        self.assertIsNotNone(ended.end_time)

        self.db.refresh(user)
        self.assertEqual(user.current_status, "Online")

        item_resumed = build_recent_login_item(self.db, user)
        self.assertEqual(item_resumed.current_status, "Online")
        self.assertFalse(item_resumed.is_on_break)

    def test_check_out_and_offline_status(self):
        user = self.staff_user
        # Check out
        check_out_session, daily = check_out_user(self.db, user)
        if check_out_session:
            self.assertIsNotNone(check_out_session.check_out)
            self.assertEqual(check_out_session.session_status, "Offline")

        self.db.refresh(user)
        self.assertEqual(user.current_status, "Offline")

        item_offline = build_recent_login_item(self.db, user)
        self.assertEqual(item_offline.current_status, "Offline")
        self.assertFalse(item_offline.is_active_session)

    def test_role_scoping_in_recent_logins(self):
        # 1. Admin sees multiple staff members
        if self.admin:
            admin_records = get_recent_logins(db=self.db, current_user=self.admin)
            self.assertIsInstance(admin_records, list)

        # 2. Employee / Intern sees only self
        emp_records = get_recent_logins(db=self.db, current_user=self.staff_user)
        self.assertEqual(len(emp_records), 1)
        self.assertEqual(emp_records[0].user_id, self.staff_user.id)

    def test_websocket_manager_connection_tracking(self):
        # Verify attendance_ws_manager connection API
        user_id = self.staff_user.id
        self.assertFalse(attendance_ws_manager.is_user_connected(user_id))


if __name__ == "__main__":
    unittest.main()
