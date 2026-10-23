import json
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies.auth import get_current_user, get_db
from app.dependencies.permissions import require_admin
from app.models.attendance import (
    AttendanceBreak,
    AttendanceCorrection,
    AttendancePolicy,
    AttendanceSession,
    DailyAttendance,
)
from app.models.staff_profile import StaffProfile
from app.models.user import User
from app.schemas.attendance import (
    AttendanceBreakResponse,
    AttendancePolicyResponse,
    AttendancePolicyUpdate,
    AttendanceRecordItem,
    AttendanceSessionResponse,
    AttendanceSummaryCounts,
    BreakEndRequest,
    BreakStartRequest,
    CheckInRequest,
    CheckOutRequest,
    CorrectionCreateRequest,
    CorrectionResponse,
    CorrectionReviewRequest,
    MonthlyStaffAttendanceSummary,
    RecentLoginStaffItem,
    TodayAttendanceStatus,
)
from app.services.attendance_service import (
    build_recent_login_item,
    check_in_user,
    check_out_user,
    end_break,
    get_authorized_staff_users,
    get_daily_records_table,
    get_dashboard_summary,
    get_default_policy,
    get_monthly_staff_report,
    get_or_create_daily_attendance,
    get_today_live_status,
    get_tz,
    local_now,
    recalculate_daily_attendance,
    serialize_policy,
    start_break,
    to_business_date,
    utc_now,
)
from app.services.attendance_websocket import attendance_ws_manager, decode_token

router = APIRouter(prefix="/api/attendance", tags=["Attendance & Breaks"])


# ----------------------------------------------------
# PERSONAL / REAL-TIME ATTENDANCE ACTIONS
# ----------------------------------------------------

@router.post("/check-in", response_model=TodayAttendanceStatus)
def check_in(
    payload: CheckInRequest = CheckInRequest(),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ip_addr = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None

    check_in_user(
        db=db,
        user=current_user,
        source=payload.source,
        ip_address=ip_addr,
        user_agent=user_agent,
    )
    return get_today_live_status(db, current_user)


@router.post("/check-out", response_model=TodayAttendanceStatus)
def check_out(
    payload: CheckOutRequest = CheckOutRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    check_out_user(db=db, user=current_user)
    return get_today_live_status(db, current_user)


@router.post("/break/start", response_model=AttendanceBreakResponse)
def handle_start_break(
    payload: BreakStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brk = start_break(
        db=db,
        user=current_user,
        break_type=payload.break_type,
        reason=payload.reason,
    )
    return AttendanceBreakResponse.model_validate(brk)


@router.post("/break/end", response_model=TodayAttendanceStatus)
def handle_end_break(
    payload: BreakEndRequest = BreakEndRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    end_break(db=db, user=current_user)
    return get_today_live_status(db, current_user)


@router.get("/today", response_model=TodayAttendanceStatus)
def get_today_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_today_live_status(db, current_user)


@router.get("/my-history", response_model=list[AttendanceRecordItem])
def get_my_history(
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy = get_default_policy(db)
    today = local_now(policy).date()

    if month:
        parts = month.split("-")
        y, m = int(parts[0]), int(parts[1])
        s_date = date(y, m, 1)
        if m == 12:
            e_date = date(y + 1, 1, 1) - date.resolution
        else:
            e_date = date(y, m + 1, 1) - date.resolution
    elif start_date and end_date:
        s_date = start_date
        e_date = end_date
    else:
        # Default to current month
        s_date = date(today.year, today.month, 1)
        e_date = today

    dailies = (
        db.query(DailyAttendance)
        .filter(
            DailyAttendance.user_id == current_user.id,
            DailyAttendance.date >= s_date,
            DailyAttendance.date <= e_date,
        )
        .order_by(DailyAttendance.date.desc())
        .all()
    )

    prof = db.query(StaffProfile).filter(StaffProfile.user_id == current_user.id).first()
    dept = prof.department if prof else None

    # Check if today has open session/break
    open_sess = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id == current_user.id,
            AttendanceSession.check_out.is_(None),
        )
        .first()
    )
    open_brk = (
        db.query(AttendanceBreak)
        .filter(
            AttendanceBreak.user_id == current_user.id,
            AttendanceBreak.end_time.is_(None),
        )
        .first()
    )

    items: list[AttendanceRecordItem] = []
    for d in dailies:
        is_today = (d.date == today)
        tot_work = d.total_work_minutes
        tot_break = d.total_break_minutes
        net_work = d.net_work_minutes

        if is_today and open_sess:
            live_add = max(0, int((utc_now() - open_sess.check_in).total_seconds() / 60))
            tot_work += live_add
            deducted_live = 0
            if open_brk and open_brk.is_deducted:
                deducted_live = max(0, int((utc_now() - open_brk.start_time).total_seconds() / 60))
            net_work = max(0, (net_work + live_add) - deducted_live)

        items.append(
            AttendanceRecordItem(
                id=d.id,
                user_id=current_user.id,
                full_name=current_user.full_name,
                email=current_user.email,
                role=current_user.role,
                department=dept,
                date=d.date,
                status="On Break" if (is_today and open_brk) else d.status,
                first_check_in=d.first_check_in,
                last_check_out=d.last_check_out,
                sessions_count=len(d.sessions),
                total_work_minutes=tot_work,
                total_break_minutes=tot_break,
                net_work_minutes=net_work,
                is_on_break=is_today and (open_brk is not None),
                is_checked_in=is_today and (open_sess is not None),
                active_break_type=open_brk.break_type if (is_today and open_brk) else None,
            )
        )

    return items


# ----------------------------------------------------
# ATTENDANCE CORRECTIONS (REQUEST & APPROVAL/REJECTION)
# ----------------------------------------------------

@router.post("/corrections", response_model=CorrectionResponse, status_code=status.HTTP_201_CREATED)
def request_correction(
    payload: CorrectionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy = get_default_policy(db)
    today = local_now(policy).date()

    if payload.request_date > today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot request attendance correction for future dates.",
        )

    daily = (
        db.query(DailyAttendance)
        .filter(
            DailyAttendance.user_id == current_user.id,
            DailyAttendance.date == payload.request_date,
        )
        .first()
    )

    correction = AttendanceCorrection(
        user_id=current_user.id,
        attendance_id=daily.id if daily else None,
        request_date=payload.request_date,
        requested_check_in=payload.requested_check_in,
        requested_check_out=payload.requested_check_out,
        requested_break_minutes=payload.requested_break_minutes,
        reason=payload.reason.strip(),
        status="Pending",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    db.add(correction)
    db.commit()
    db.refresh(correction)

    try:
        from app.services.notification_service import notify_attendance_correction
        notify_attendance_correction(db, correction, current_user)
        db.commit()
    except Exception as exc:
        print(f"[attendance] notification error: {exc}")

    return CorrectionResponse(
        id=correction.id,
        user_id=current_user.id,
        full_name=current_user.full_name,
        email=current_user.email,
        request_date=correction.request_date,
        requested_check_in=correction.requested_check_in,
        requested_check_out=correction.requested_check_out,
        requested_break_minutes=correction.requested_break_minutes or 0,
        reason=correction.reason,
        status=correction.status,
        reviewed_by_id=None,
        reviewer_name=None,
        reviewer_remarks=None,
        reviewed_at=None,
        created_at=correction.created_at,
    )


@router.get("/corrections", response_model=list[CorrectionResponse])
def list_corrections(
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(AttendanceCorrection).join(User, User.id == AttendanceCorrection.user_id)

    if current_user.role == "admin":
        pass  # Admin sees all
    elif current_user.role == "manager":
        authorized_users = get_authorized_staff_users(db, current_user)
        auth_ids = [u.id for u in authorized_users]
        query = query.filter(AttendanceCorrection.user_id.in_(auth_ids))
    else:
        # Regular employee/intern sees only their own
        query = query.filter(AttendanceCorrection.user_id == current_user.id)

    if status_filter and status_filter != "All":
        query = query.filter(AttendanceCorrection.status == status_filter)

    rows = query.order_by(AttendanceCorrection.created_at.desc()).all()

    # Load reviewers
    reviewer_ids = {c.reviewed_by_id for c in rows if c.reviewed_by_id}
    reviewers = db.query(User).filter(User.id.in_(reviewer_ids)).all() if reviewer_ids else []
    reviewer_map = {r.id: r.full_name for r in reviewers}

    results: list[CorrectionResponse] = []
    for c in rows:
        results.append(
            CorrectionResponse(
                id=c.id,
                user_id=c.user_id,
                full_name=c.user.full_name if c.user else f"User #{c.user_id}",
                email=c.user.email if c.user else "",
                request_date=c.request_date,
                requested_check_in=c.requested_check_in,
                requested_check_out=c.requested_check_out,
                requested_break_minutes=c.requested_break_minutes or 0,
                reason=c.reason,
                status=c.status,
                reviewed_by_id=c.reviewed_by_id,
                reviewer_name=reviewer_map.get(c.reviewed_by_id),
                reviewer_remarks=c.reviewer_remarks,
                reviewed_at=c.reviewed_at,
                created_at=c.created_at,
            )
        )

    return results


@router.patch("/corrections/{correction_id}", response_model=CorrectionResponse)
def review_correction(
    correction_id: int,
    payload: CorrectionReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and managers can review attendance corrections.",
        )

    correction = (
        db.query(AttendanceCorrection)
        .filter(AttendanceCorrection.id == correction_id)
        .first()
    )
    if not correction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Correction request not found.")

    # Manager scope check
    if current_user.role == "manager":
        team = get_authorized_staff_users(db, current_user)
        team_ids = {u.id for u in team}
        if correction.user_id not in team_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only review attendance corrections for your assigned team members.",
            )

    if correction.status != "Pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This correction request has already been {correction.status.lower()}.",
        )

    now = utc_now()
    policy = get_default_policy(db)

    if payload.action == "approve":
        correction.status = "Approved"
        correction.reviewed_by_id = current_user.id
        correction.reviewer_remarks = payload.reviewer_remarks.strip()
        correction.reviewed_at = now
        correction.updated_at = now

        # Apply the correction to DailyAttendance & AttendanceSession
        daily = get_or_create_daily_attendance(db, correction.user_id, correction.request_date, policy)

        # Clear existing sessions for this date or add a corrected session
        session = (
            db.query(AttendanceSession)
            .filter(
                AttendanceSession.attendance_id == daily.id,
                AttendanceSession.source == "correction",
            )
            .first()
        )
        dur = max(
            0,
            int(
                (correction.requested_check_out - correction.requested_check_in).total_seconds() / 60
            ),
        )
        if not session:
            session = AttendanceSession(
                attendance_id=daily.id,
                user_id=correction.user_id,
                check_in=correction.requested_check_in,
                check_out=correction.requested_check_out,
                duration_minutes=dur,
                source="correction",
                created_at=now,
            )
            db.add(session)
        else:
            session.check_in = correction.requested_check_in
            session.check_out = correction.requested_check_out
            session.duration_minutes = dur

        daily.first_check_in = correction.requested_check_in
        daily.last_check_out = correction.requested_check_out
        daily.total_work_minutes = dur
        daily.total_break_minutes = correction.requested_break_minutes or 0
        daily.net_work_minutes = max(0, dur - (correction.requested_break_minutes or 0))

        # Re-evaluate status based on shift start
        shift_dt = datetime.combine(daily.date, policy.shift_start_time, tzinfo=get_tz(policy))
        local_first = correction.requested_check_in.astimezone(get_tz(policy))
        grace_limit = shift_dt + timedelta(minutes=policy.grace_period_minutes)
        daily.status = "Present" if local_first <= grace_limit else "Late"
        daily.is_finalized = True
        daily.updated_at = now

    elif payload.action == "reject":
        correction.status = "Rejected"
        correction.reviewed_by_id = current_user.id
        correction.reviewer_remarks = payload.reviewer_remarks.strip()
        correction.reviewed_at = now
        correction.updated_at = now

    db.commit()
    db.refresh(correction)

    try:
        from app.services.notification_service import notify_attendance_correction_decision
        notify_attendance_correction_decision(db, correction, current_user)
        db.commit()
    except Exception as exc:
        print(f"[attendance] notification error: {exc}")

    return CorrectionResponse(
        id=correction.id,
        user_id=correction.user_id,
        full_name=correction.user.full_name if correction.user else f"User #{correction.user_id}",
        email=correction.user.email if correction.user else "",
        request_date=correction.request_date,
        requested_check_in=correction.requested_check_in,
        requested_check_out=correction.requested_check_out,
        requested_break_minutes=correction.requested_break_minutes or 0,
        reason=correction.reason,
        status=correction.status,
        reviewed_by_id=correction.reviewed_by_id,
        reviewer_name=current_user.full_name,
        reviewer_remarks=correction.reviewer_remarks,
        reviewed_at=correction.reviewed_at,
        created_at=correction.created_at,
    )


# ----------------------------------------------------
# ADMIN & MANAGER DASHBOARD SUMMARY & REPORTS
# ----------------------------------------------------

@router.get("/admin/summary", response_model=AttendanceSummaryCounts)
def get_admin_summary(
    date_param: date | None = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    policy = get_default_policy(db)
    target_date = date_param or local_now(policy).date()

    return get_dashboard_summary(db, current_user, target_date)


@router.get("/admin/records", response_model=list[AttendanceRecordItem])
def list_admin_records(
    date_param: date | None = Query(default=None, alias="date"),
    q: str | None = None,
    department: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    policy = get_default_policy(db)
    target_date = date_param or local_now(policy).date()

    return get_daily_records_table(
        db=db,
        current_user=current_user,
        target_date=target_date,
        q=q,
        department=department,
        status_filter=status_filter,
    )


@router.websocket("/ws")
async def attendance_websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(None),
):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id = None
    db = SessionLocal()
    try:
        user_id = int(payload["sub"])
        user = db.query(User).filter(User.id == user_id, User.status == "active").first()
        if not user:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await attendance_ws_manager.connect(websocket, user)
        # Update user last seen & session heartbeat
        now = utc_now()
        user.last_seen_at = now
        open_session = (
            db.query(AttendanceSession)
            .filter(AttendanceSession.user_id == user.id, AttendanceSession.check_out.is_(None))
            .first()
        )
        if open_session:
            open_session.last_heartbeat = now
        db.commit()
        # Broadcast connected status to authorized viewers
        await attendance_ws_manager.broadcast_user_update(user.id, db=db)
    except Exception:
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        return
    finally:
        db.close()

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except Exception:
                msg = {"type": data}

            msg_type = msg.get("type")
            if msg_type == "ping":
                hb_db = SessionLocal()
                try:
                    now = utc_now()
                    u = hb_db.query(User).filter(User.id == user_id).first()
                    if u:
                        u.last_seen_at = now
                    s = (
                        hb_db.query(AttendanceSession)
                        .filter(AttendanceSession.user_id == user_id, AttendanceSession.check_out.is_(None))
                        .first()
                    )
                    if s:
                        s.last_heartbeat = now
                    hb_db.commit()
                except Exception:
                    pass
                finally:
                    hb_db.close()

                await websocket.send_json({
                    "type": "pong",
                    "timestamp": utc_now().isoformat(),
                })
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        disconnected_user_id = await attendance_ws_manager.disconnect(websocket)
        if disconnected_user_id:
            if not attendance_ws_manager.is_user_connected(disconnected_user_id):
                try:
                    await attendance_ws_manager.broadcast_user_update(disconnected_user_id)
                except Exception:
                    pass


@router.get("/admin/recent-logins", response_model=list[RecentLoginStaffItem])
@router.get("/recent-logins", response_model=list[RecentLoginStaffItem])
def get_recent_logins(
    q: str | None = None,
    department: str | None = None,
    role: str | None = None,
    status: str | None = None,
    date: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Role Scoping:
    # - Admins see all staff members across the organization.
    # - Managers see staff members within their permitted scope.
    # - Employees and Interns see only their own attendance and break status.
    if current_user.role == "admin":
        users = (
            db.query(User)
            .filter(
                User.status.in_(("active", "invitation_pending")),
            )
            .order_by(User.full_name)
            .all()
        )
    elif current_user.role == "manager":
        users = get_authorized_staff_users(db, current_user)
    else:
        users = [current_user]

    if not users:
        return []

    policy = get_default_policy(db)
    results: list[RecentLoginStaffItem] = []

    for user in users:
        item = build_recent_login_item(db, user, policy)

        # Department filter
        if department and department != "All":
            if not item.department or item.department.lower() != department.strip().lower():
                continue

        # Role filter
        if role and role != "All" and item.role.lower() != role.strip().lower():
            continue

        # Status filter ("All", "Online", "On Break", "Offline", "Never Logged In")
        if status and status != "All":
            if item.current_status.lower() != status.strip().lower():
                continue

        # Date filter
        if date:
            if not item.last_login or to_business_date(item.last_login, policy) != date:
                continue

        if date_from and date_to:
            if not item.last_login:
                continue
            sess_date = to_business_date(item.last_login, policy)
            if sess_date < date_from or sess_date > date_to:
                continue

        # Query search filter
        if q:
            term = q.strip().lower()
            name_match = bool(item.full_name and term in item.full_name.lower())
            email_match = bool(term in item.email.lower())
            id_match = bool(item.staff_id and term in item.staff_id.lower())
            dept_match = bool(item.department and term in item.department.lower())
            if not (name_match or email_match or id_match or dept_match):
                continue

        results.append(item)

    # Sort newest login first, users with no login placed at end
    results.sort(
        key=lambda item: (
            item.last_login is not None,
            item.last_login or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )

    return results


@router.get("/admin/monthly-report", response_model=list[MonthlyStaffAttendanceSummary])
def get_admin_monthly_report(
    year: int | None = None,
    month: int | None = None,
    department: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    policy = get_default_policy(db)
    today = local_now(policy).date()
    y = year or today.year
    m = month or today.month

    if m < 1 or m > 12:
        raise HTTPException(status_code=400, detail="Invalid month. Must be between 1 and 12.")

    return get_monthly_staff_report(
        db=db,
        current_user=current_user,
        year=y,
        month=m,
        department=department,
    )


# ----------------------------------------------------
# ATTENDANCE POLICY (VIEW & UPDATE)
# ----------------------------------------------------

@router.get("/policy", response_model=AttendancePolicyResponse)
def get_policy(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy = get_default_policy(db)
    return serialize_policy(policy)


@router.put("/policy", response_model=AttendancePolicyResponse)
def update_policy(
    payload: AttendancePolicyUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    policy = get_default_policy(db)

    if payload.shift_start_time:
        parts = [int(p) for p in payload.shift_start_time.split(":")]
        policy.shift_start_time = time(parts[0], parts[1], parts[2] if len(parts) > 2 else 0)

    if payload.cutoff_time:
        parts = [int(p) for p in payload.cutoff_time.split(":")]
        policy.cutoff_time = time(parts[0], parts[1], parts[2] if len(parts) > 2 else 0)

    if payload.grace_period_minutes is not None:
        policy.grace_period_minutes = payload.grace_period_minutes

    if payload.expected_daily_hours is not None:
        policy.expected_daily_hours = Decimal(str(payload.expected_daily_hours))

    if payload.deduct_lunch_break is not None:
        policy.deduct_lunch_break = payload.deduct_lunch_break

    if payload.deduct_tea_break is not None:
        policy.deduct_tea_break = payload.deduct_tea_break

    if payload.deduct_personal_break is not None:
        policy.deduct_personal_break = payload.deduct_personal_break

    if payload.deduct_short_break is not None:
        policy.deduct_short_break = payload.deduct_short_break

    if payload.max_break_minutes is not None:
        policy.max_break_minutes = payload.max_break_minutes

    policy.updated_at = utc_now()
    db.commit()
    db.refresh(policy)

    return serialize_policy(policy)
