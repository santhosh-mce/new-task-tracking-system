from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
import zoneinfo
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.attendance import (
    AttendanceBreak,
    AttendanceCorrection,
    AttendancePolicy,
    AttendanceSession,
    DailyAttendance,
    UserLeave,
)
from app.models.project import Project, ProjectMember
from app.models.staff_profile import StaffProfile
from app.models.task import Task, TaskAssignment
from app.models.user import User
from app.schemas.attendance import (
    AttendanceBreakResponse,
    AttendancePolicyResponse,
    AttendanceRecordItem,
    AttendanceSessionResponse,
    AttendanceSummaryCounts,
    MonthlyStaffAttendanceSummary,
    RecentLoginStaffItem,
    TodayAttendanceStatus,
)


def get_tz(policy: AttendancePolicy | None = None) -> zoneinfo.ZoneInfo:
    tz_name = policy.timezone if policy and policy.timezone else "Asia/Kolkata"
    try:
        return zoneinfo.ZoneInfo(tz_name)
    except Exception:
        return zoneinfo.ZoneInfo("Asia/Kolkata")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def local_now(policy: AttendancePolicy | None = None) -> datetime:
    return utc_now().astimezone(get_tz(policy))


def to_business_date(dt_utc: datetime, policy: AttendancePolicy | None = None) -> date:
    dt = ensure_utc(dt_utc)
    return dt.astimezone(get_tz(policy)).date()


def get_default_policy(db: Session) -> AttendancePolicy:
    policy = db.query(AttendancePolicy).filter(AttendancePolicy.id == 1).first()
    if not policy:
        policy = AttendancePolicy(
            id=1,
            company_name="Ingage",
            shift_start_time=time(9, 30),
            grace_period_minutes=15,
            expected_daily_hours=Decimal("8.00"),
            cutoff_time=time(14, 0),
            timezone="Asia/Kolkata",
            deduct_lunch_break=True,
            deduct_tea_break=False,
            deduct_personal_break=True,
            deduct_short_break=False,
            max_break_minutes=60,
            updated_at=utc_now(),
        )
        db.add(policy)
        db.commit()
        db.refresh(policy)
    return policy


def serialize_policy(policy: AttendancePolicy) -> AttendancePolicyResponse:
    return AttendancePolicyResponse(
        id=policy.id,
        company_name=policy.company_name,
        shift_start_time=policy.shift_start_time.strftime("%H:%M"),
        grace_period_minutes=policy.grace_period_minutes,
        expected_daily_hours=float(policy.expected_daily_hours),
        cutoff_time=policy.cutoff_time.strftime("%H:%M"),
        timezone=policy.timezone,
        deduct_lunch_break=policy.deduct_lunch_break,
        deduct_tea_break=policy.deduct_tea_break,
        deduct_personal_break=policy.deduct_personal_break,
        deduct_short_break=policy.deduct_short_break,
        max_break_minutes=policy.max_break_minutes,
    )


def is_break_deducted(break_type: str, policy: AttendancePolicy) -> bool:
    bt = break_type.strip().lower()
    if bt == "lunch":
        return policy.deduct_lunch_break
    if bt in ("tea", "coffee"):
        return policy.deduct_tea_break
    if bt == "personal":
        return policy.deduct_personal_break
    if bt == "short break":
        return policy.deduct_short_break
    return True


def get_authorized_staff_users(db: Session, current_user: User) -> list[User]:
    if current_user.role == "admin":
        return (
            db.query(User)
            .filter(
                User.status.in_(("active", "invitation_pending")),
                User.role.in_(("employee", "intern", "manager", "admin")),
            )
            .order_by(User.full_name)
            .all()
        )

    if current_user.role == "manager":
        # 1. Users reporting directly to this manager
        reporting_user_ids = {
            r[0]
            for r in db.query(StaffProfile.user_id)
            .filter(StaffProfile.reporting_manager_id == current_user.id)
            .all()
        }

        # 2. Members of projects managed by this manager
        project_ids = [
            p.id for p in db.query(Project.id).filter(Project.manager_id == current_user.id).all()
        ]
        project_member_ids = set()
        if project_ids:
            project_member_ids = {
                r[0]
                for r in db.query(ProjectMember.user_id)
                .filter(ProjectMember.project_id.in_(project_ids))
                .all()
            }
            # Also tasks assigned in these projects
            task_assignee_ids = {
                r[0]
                for r in db.query(TaskAssignment.user_id)
                .join(Task, Task.id == TaskAssignment.task_id)
                .filter(Task.project_id.in_(project_ids))
                .all()
            }
            project_member_ids.update(task_assignee_ids)

        all_team_ids = reporting_user_ids | project_member_ids | {current_user.id}
        return (
            db.query(User)
            .filter(User.id.in_(all_team_ids), User.status.in_(("active", "invitation_pending")))
            .order_by(User.full_name)
            .all()
        )

    # Regular employee or intern sees only self
    return [current_user]


def get_or_create_daily_attendance(
    db: Session,
    user_id: int,
    target_date: date,
    policy: AttendancePolicy | None = None,
) -> DailyAttendance:
    daily = (
        db.query(DailyAttendance)
        .filter(DailyAttendance.user_id == user_id, DailyAttendance.date == target_date)
        .first()
    )
    if not daily:
        daily = DailyAttendance(
            user_id=user_id,
            date=target_date,
            status="Not Checked In",
            total_work_minutes=0,
            total_break_minutes=0,
            net_work_minutes=0,
            is_finalized=False,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        db.add(daily)
        db.flush()
    return daily


def recalculate_daily_attendance(
    daily: DailyAttendance,
    policy: AttendancePolicy,
    db: Session,
) -> None:
    # 1. Sessions calculation
    completed_sessions = [s for s in daily.sessions if s.check_out is not None]
    has_open_session = any(s.check_out is None for s in daily.sessions)

    total_work_mins = 0
    for s in completed_sessions:
        if s.duration_minutes is not None:
            total_work_mins += s.duration_minutes
        elif s.check_out and s.check_in:
            duration = max(0, int((ensure_utc(s.check_out) - ensure_utc(s.check_in)).total_seconds() / 60))
            s.duration_minutes = duration
            total_work_mins += duration

    # 2. Breaks calculation
    completed_breaks = [b for b in daily.breaks if b.end_time is not None]
    has_open_break = any(b.end_time is None for b in daily.breaks)

    total_break_mins = 0
    deducted_break_mins = 0
    for b in completed_breaks:
        if b.duration_minutes is not None:
            dur = b.duration_minutes
        elif b.end_time and b.start_time:
            dur = max(0, int((ensure_utc(b.end_time) - ensure_utc(b.start_time)).total_seconds() / 60))
            b.duration_minutes = dur
        else:
            dur = 0

        total_break_mins += dur
        if b.is_deducted:
            deducted_break_mins += dur

    daily.total_work_minutes = total_work_mins
    daily.total_break_minutes = total_break_mins
    daily.net_work_minutes = max(0, total_work_mins - deducted_break_mins)

    # First check in & last check out
    all_check_ins = [ensure_utc(s.check_in) for s in daily.sessions if s.check_in]
    if all_check_ins:
        daily.first_check_in = min(all_check_ins)

    all_check_outs = [ensure_utc(s.check_out) for s in completed_sessions if s.check_out]
    if all_check_outs and not has_open_session:
        daily.last_check_out = max(all_check_outs)
    elif has_open_session:
        daily.last_check_out = None

    # Status determination based on first check in and policy shift start + grace
    if daily.first_check_in:
        local_first_dt = ensure_utc(daily.first_check_in).astimezone(get_tz(policy))
        shift_dt = datetime.combine(daily.date, policy.shift_start_time, tzinfo=get_tz(policy))
        grace_limit = shift_dt + timedelta(minutes=policy.grace_period_minutes)

        if local_first_dt <= grace_limit:
            daily.status = "Present"
        else:
            daily.status = "Late"
    else:
        # Check leave table
        has_leave = (
            db.query(UserLeave)
            .filter(
                UserLeave.user_id == daily.user_id,
                UserLeave.leave_date == daily.date,
                UserLeave.status == "Approved",
            )
            .first()
        )
        if has_leave:
            daily.status = "On Leave"
        else:
            daily.status = "Not Checked In"

    daily.is_finalized = not (has_open_session or has_open_break)
    daily.updated_at = utc_now()


def check_in_user(
    db: Session,
    user: User,
    source: str = "manual",
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[AttendanceSession, DailyAttendance]:
    policy = get_default_policy(db)
    now = utc_now()
    today_date = to_business_date(now, policy)

    daily = get_or_create_daily_attendance(db, user.id, today_date, policy)

    # Idempotent check: if an open session already exists for this user today, return it directly!
    open_session = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id == user.id,
            AttendanceSession.check_out.is_(None),
        )
        .first()
    )
    if open_session:
        open_session.last_heartbeat = now
        open_session.session_status = "Online"
        user.last_login_at = user.last_login_at or open_session.check_in or now
        user.last_seen_at = now
        user.current_status = "Online"
        db.commit()
        from app.services.attendance_websocket import attendance_ws_manager
        attendance_ws_manager.sync_broadcast_user_update(user.id)
        return open_session, daily

    # Create new session
    session = AttendanceSession(
        attendance_id=daily.id,
        user_id=user.id,
        check_in=now,
        last_heartbeat=now,
        session_status="Online",
        source=source,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=now,
    )
    db.add(session)
    db.flush()

    # Update user status & last login
    user.last_login_at = now
    user.last_seen_at = now
    user.current_status = "Online"

    # Update daily record
    daily.sessions.append(session)
    recalculate_daily_attendance(daily, policy, db)
    db.commit()
    db.refresh(session)
    db.refresh(daily)

    from app.services.attendance_websocket import attendance_ws_manager
    attendance_ws_manager.sync_broadcast_user_update(user.id)

    return session, daily


def check_out_user(
    db: Session,
    user: User,
) -> tuple[AttendanceSession | None, DailyAttendance]:
    policy = get_default_policy(db)
    now = utc_now()
    today_date = to_business_date(now, policy)

    daily = get_or_create_daily_attendance(db, user.id, today_date, policy)

    open_session = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id == user.id,
            AttendanceSession.check_out.is_(None),
        )
        .first()
    )

    if not open_session:
        user.current_status = "Offline"
        user.last_seen_at = now
        db.commit()
        from app.services.attendance_websocket import attendance_ws_manager
        attendance_ws_manager.sync_broadcast_user_update(user.id)
        return None, daily

    # If user has an open break, close it now
    open_break = (
        db.query(AttendanceBreak)
        .filter(
            AttendanceBreak.user_id == user.id,
            AttendanceBreak.end_time.is_(None),
        )
        .first()
    )
    if open_break:
        open_break.end_time = now
        open_break.duration_minutes = max(0, int((now - ensure_utc(open_break.start_time)).total_seconds() / 60))

    open_session.check_out = now
    open_session.duration_minutes = max(
        0, int((now - ensure_utc(open_session.check_in)).total_seconds() / 60)
    )
    open_session.session_status = "Offline"
    open_session.last_heartbeat = now
    user.current_status = "Offline"
    user.last_seen_at = now

    recalculate_daily_attendance(daily, policy, db)
    db.commit()
    db.refresh(open_session)
    db.refresh(daily)

    from app.services.attendance_websocket import attendance_ws_manager
    attendance_ws_manager.sync_broadcast_user_update(user.id)

    return open_session, daily


def start_break(
    db: Session,
    user: User,
    break_type: str = "Lunch",
    reason: str | None = None,
) -> AttendanceBreak:
    policy = get_default_policy(db)
    now = utc_now()
    today_date = to_business_date(now, policy)

    daily = get_or_create_daily_attendance(db, user.id, today_date, policy)

    # User must have an active open session to start a break
    open_session = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id == user.id,
            AttendanceSession.check_out.is_(None),
        )
        .first()
    )
    if not open_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must be checked in to start a break.",
        )

    # Idempotent check: if already on break, return existing break
    open_break = (
        db.query(AttendanceBreak)
        .filter(
            AttendanceBreak.user_id == user.id,
            AttendanceBreak.end_time.is_(None),
        )
        .first()
    )
    if open_break:
        return open_break

    deducted = is_break_deducted(break_type, policy)
    brk = AttendanceBreak(
        attendance_id=daily.id,
        session_id=open_session.id,
        user_id=user.id,
        break_type=break_type,
        start_time=now,
        is_deducted=deducted,
        reason=reason.strip() if reason else None,
        created_at=now,
    )
    db.add(brk)

    open_session.session_status = "On Break"
    open_session.last_heartbeat = now
    user.current_status = "On Break"
    user.last_seen_at = now

    db.commit()
    db.refresh(brk)

    from app.services.attendance_websocket import attendance_ws_manager
    attendance_ws_manager.sync_broadcast_user_update(user.id)

    return brk


def end_break(
    db: Session,
    user: User,
) -> AttendanceBreak | None:
    policy = get_default_policy(db)
    now = utc_now()
    today_date = to_business_date(now, policy)

    open_break = (
        db.query(AttendanceBreak)
        .filter(
            AttendanceBreak.user_id == user.id,
            AttendanceBreak.end_time.is_(None),
        )
        .first()
    )
    if not open_break:
        return None

    open_break.end_time = now
    open_break.duration_minutes = max(
        0, int((now - ensure_utc(open_break.start_time)).total_seconds() / 60)
    )

    open_session = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id == user.id,
            AttendanceSession.check_out.is_(None),
        )
        .first()
    )
    if open_session:
        open_session.session_status = "Online"
        open_session.last_heartbeat = now

    user.current_status = "Online"
    user.last_seen_at = now

    daily = get_or_create_daily_attendance(db, user.id, today_date, policy)
    recalculate_daily_attendance(daily, policy, db)
    db.commit()
    db.refresh(open_break)

    from app.services.attendance_websocket import attendance_ws_manager
    attendance_ws_manager.sync_broadcast_user_update(user.id)

    return open_break


def build_recent_login_item(
    db: Session,
    user: User,
    policy: AttendancePolicy | None = None,
    is_ws_connected: bool | None = None,
) -> RecentLoginStaffItem:
    if policy is None:
        policy = get_default_policy(db)

    now = utc_now()
    today = to_business_date(now, policy)

    prof = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    staff_id = (
        prof.staff_id
        if prof and prof.staff_id
        else f"{'INT' if user.role == 'intern' else 'EMP'}-{user.id:04d}"
    )
    dept = prof.department if prof and prof.department else "Ingage"
    photo = prof.profile_photo if prof else None

    # Latest session for this user
    sess = (
        db.query(AttendanceSession)
        .filter(AttendanceSession.user_id == user.id)
        .order_by(AttendanceSession.check_in.desc())
        .first()
    )

    # Active break if any
    active_break = (
        db.query(AttendanceBreak)
        .filter(
            AttendanceBreak.user_id == user.id,
            AttendanceBreak.end_time.is_(None),
        )
        .order_by(AttendanceBreak.start_time.desc())
        .first()
    )

    from app.services.attendance_websocket import attendance_ws_manager
    ws_connected = is_ws_connected if is_ws_connected is not None else attendance_ws_manager.is_user_connected(user.id)

    if sess is None:
        status_str = "Never Logged In"
        last_login = None
        source = None
        is_active = False
        is_on_break = False
        session_sec = 0
        break_sec = 0
        working_sec = 0
        last_act = user.last_seen_at or user.last_login_at
    else:
        last_login = sess.check_in
        source = sess.source
        sess_date = to_business_date(sess.check_in, policy)
        is_today_session = (sess_date == today)

        if sess.check_out is not None:
            status_str = "Offline"
            is_active = False
            is_on_break = False
            session_sec = max(0, int((ensure_utc(sess.check_out) - ensure_utc(sess.check_in)).total_seconds()))
            # Sum completed breaks for this session
            completed_breaks = (
                db.query(AttendanceBreak)
                .filter(
                    AttendanceBreak.user_id == user.id,
                    AttendanceBreak.session_id == sess.id,
                    AttendanceBreak.end_time.isnot(None),
                )
                .all()
            )
            break_sec = sum(
                max(0, int((ensure_utc(b.end_time) - ensure_utc(b.start_time)).total_seconds()))
                for b in completed_breaks if b.end_time and b.start_time
            )
            working_sec = max(0, session_sec - break_sec)
            last_act = sess.check_out
        else:
            # Session check_out is None
            if not is_today_session:
                # Past day session left hanging -> treat as Offline
                status_str = "Offline"
                is_active = False
                is_on_break = False
                session_sec = sess.duration_minutes * 60 if sess.duration_minutes else 0
                break_sec = 0
                working_sec = session_sec
                last_act = sess.last_heartbeat or sess.check_in
            else:
                # Today's active session: check heartbeat freshness
                last_hb = sess.last_heartbeat or sess.check_in
                seconds_since_hb = (now - ensure_utc(last_hb)).total_seconds() if last_hb else 9999

                if active_break is not None:
                    status_str = "On Break"
                    is_active = True
                    is_on_break = True
                elif ws_connected or seconds_since_hb <= 90:
                    status_str = "Online"
                    is_active = True
                    is_on_break = False
                else:
                    status_str = "Offline"
                    is_active = False
                    is_on_break = False

                session_sec = max(0, int((now - ensure_utc(sess.check_in)).total_seconds()))

                # Completed breaks today
                completed_breaks = (
                    db.query(AttendanceBreak)
                    .filter(
                        AttendanceBreak.user_id == user.id,
                        AttendanceBreak.end_time.isnot(None),
                        AttendanceBreak.start_time >= datetime.combine(today, time.min, tzinfo=timezone.utc),
                    )
                    .all()
                )
                c_break_sec = sum(
                    max(0, int((ensure_utc(b.end_time) - ensure_utc(b.start_time)).total_seconds()))
                    for b in completed_breaks if b.end_time and b.start_time
                )
                live_break_sec = 0
                if active_break and active_break.start_time:
                    live_break_sec = max(0, int((now - ensure_utc(active_break.start_time)).total_seconds()))

                break_sec = c_break_sec + live_break_sec
                working_sec = max(0, session_sec - break_sec)
                last_act = sess.last_heartbeat or user.last_seen_at or sess.check_in

    legacy_login_status = "Logged in" if is_active else ("Last session" if sess else "Never logged in")

    return RecentLoginStaffItem(
        user_id=user.id,
        full_name=user.full_name or "Staff Member",
        email=user.email,
        role=user.role,
        staff_id=staff_id,
        department=dept,
        profile_photo=photo,
        last_login=last_login,
        login_status=legacy_login_status,
        current_status=status_str,
        session_duration_seconds=session_sec,
        break_duration_seconds=break_sec,
        working_duration_seconds=working_sec,
        last_activity=last_act,
        is_active_session=is_active,
        is_on_break=is_on_break,
        active_break_start=active_break.start_time if (active_break and is_on_break) else None,
        source=source,
    )


def get_today_live_status(
    db: Session,
    user: User,
) -> TodayAttendanceStatus:
    policy = get_default_policy(db)
    now = utc_now()
    today_date = to_business_date(now, policy)

    daily = get_or_create_daily_attendance(db, user.id, today_date, policy)
    recalculate_daily_attendance(daily, policy, db)
    db.commit()

    open_session = (
        db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id == user.id,
            AttendanceSession.check_out.is_(None),
        )
        .first()
    )
    open_break = (
        db.query(AttendanceBreak)
        .filter(
            AttendanceBreak.user_id == user.id,
            AttendanceBreak.end_time.is_(None),
        )
        .first()
    )

    is_checked_in = open_session is not None
    is_on_break = open_break is not None

    # Calculate live elapsed time
    completed_work = daily.total_work_minutes
    live_session_mins = 0
    if open_session:
        live_session_mins = max(0, int((now - ensure_utc(open_session.check_in)).total_seconds() / 60))

    completed_break_mins = daily.total_break_minutes
    live_break_mins = 0
    live_deducted_break_mins = 0
    if open_break:
        live_break_mins = max(0, int((now - ensure_utc(open_break.start_time)).total_seconds() / 60))
        if open_break.is_deducted:
            live_deducted_break_mins = live_break_mins

    # Calculate real net working time = total completed work + live session work - (deducted breaks)
    total_deducted_breaks = 0
    for b in daily.breaks:
        if b.is_deducted:
            if b.end_time:
                total_deducted_breaks += b.duration_minutes or 0
    total_deducted_breaks += live_deducted_break_mins

    net_work_mins = max(0, (completed_work + live_session_mins) - total_deducted_breaks)

    # Dynamic status
    display_status = daily.status
    if is_on_break:
        display_status = "On Break"
    elif is_checked_in:
        display_status = daily.status if daily.status in ("Present", "Late") else "Present"

    return TodayAttendanceStatus(
        date=today_date,
        status=display_status,
        is_checked_in=is_checked_in,
        is_on_break=is_on_break,
        active_session_id=open_session.id if open_session else None,
        active_session_start=open_session.check_in if open_session else None,
        active_break_id=open_break.id if open_break else None,
        active_break_type=open_break.break_type if open_break else None,
        active_break_start=open_break.start_time if open_break else None,
        first_check_in=daily.first_check_in,
        last_check_out=daily.last_check_out,
        completed_work_minutes=completed_work + live_session_mins,
        total_break_minutes=completed_break_mins + live_break_mins,
        net_work_minutes=net_work_mins,
        server_time=now,
        sessions=[
            AttendanceSessionResponse.model_validate(s) for s in daily.sessions
        ],
        breaks=[
            AttendanceBreakResponse.model_validate(b) for b in daily.breaks
        ],
        policy=serialize_policy(policy),
    )


def compute_staff_status_for_date(
    user: User,
    daily: DailyAttendance | None,
    open_break: AttendanceBreak | None,
    has_leave: bool,
    target_date: date,
    policy: AttendancePolicy,
) -> tuple[str, bool]:
    now_local = local_now(policy)
    is_today = (target_date == now_local.date())
    is_past = (target_date < now_local.date())

    cutoff_passed = (
        not is_today
        or now_local.time() >= policy.cutoff_time
    )

    if open_break and is_today:
        return "On Break", cutoff_passed

    if daily and daily.first_check_in:
        return daily.status, cutoff_passed

    if has_leave:
        return "On Leave", cutoff_passed

    if is_today:
        if now_local.time() < policy.cutoff_time:
            return "Not Checked In", False
        else:
            return "Absent", True

    if is_past:
        return "Absent", True

    return "Not Checked In", False


def get_dashboard_summary(
    db: Session,
    current_user: User,
    target_date: date,
) -> AttendanceSummaryCounts:
    policy = get_default_policy(db)
    staff_users = get_authorized_staff_users(db, current_user)
    staff_ids = [u.id for u in staff_users]

    # Batch query daily attendances for target_date
    dailies = (
        db.query(DailyAttendance)
        .filter(
            DailyAttendance.user_id.in_(staff_ids),
            DailyAttendance.date == target_date,
        )
        .all()
    )
    daily_map = {d.user_id: d for d in dailies}

    # Batch query open breaks if target_date is today
    now_local = local_now(policy)
    is_today = (target_date == now_local.date())
    open_breaks_map = {}
    if is_today:
        active_breaks = (
            db.query(AttendanceBreak)
            .filter(
                AttendanceBreak.user_id.in_(staff_ids),
                AttendanceBreak.end_time.is_(None),
            )
            .all()
        )
        open_breaks_map = {b.user_id: b for b in active_breaks}

    # Batch query leaves for target_date
    leaves = (
        db.query(UserLeave.user_id)
        .filter(
            UserLeave.user_id.in_(staff_ids),
            UserLeave.leave_date == target_date,
            UserLeave.status == "Approved",
        )
        .all()
    )
    leave_set = {r[0] for r in leaves}

    cutoff_passed = False
    present_count = 0
    late_count = 0
    on_break_count = 0
    not_checked_in_count = 0
    absent_count = 0
    on_leave_count = 0

    for user in staff_users:
        daily = daily_map.get(user.id)
        brk = open_breaks_map.get(user.id)
        has_leave = user.id in leave_set

        stat, passed = compute_staff_status_for_date(
            user=user,
            daily=daily,
            open_break=brk,
            has_leave=has_leave,
            target_date=target_date,
            policy=policy,
        )
        cutoff_passed = passed

        if stat == "On Break":
            on_break_count += 1
            # Also count underlying check-in status
            if daily and daily.status == "Late":
                late_count += 1
            else:
                present_count += 1
        elif stat == "Present":
            present_count += 1
        elif stat == "Late":
            late_count += 1
        elif stat == "On Leave":
            on_leave_count += 1
        elif stat == "Not Checked In":
            not_checked_in_count += 1
        elif stat == "Absent":
            absent_count += 1

    return AttendanceSummaryCounts(
        date=target_date,
        total_staff=len(staff_users),
        present_count=present_count,
        late_count=late_count,
        on_break_count=on_break_count,
        not_checked_in_count=not_checked_in_count,
        absent_count=absent_count,
        on_leave_count=on_leave_count,
        cutoff_passed=cutoff_passed,
    )


def get_daily_records_table(
    db: Session,
    current_user: User,
    target_date: date,
    q: str | None = None,
    department: str | None = None,
    status_filter: str | None = None,
) -> list[AttendanceRecordItem]:
    policy = get_default_policy(db)
    staff_users = get_authorized_staff_users(db, current_user)
    staff_ids = [u.id for u in staff_users]

    # Profiles map for department
    profiles = db.query(StaffProfile).filter(StaffProfile.user_id.in_(staff_ids)).all()
    profile_map = {p.user_id: p for p in profiles}

    # Batch query daily attendances
    dailies = (
        db.query(DailyAttendance)
        .filter(
            DailyAttendance.user_id.in_(staff_ids),
            DailyAttendance.date == target_date,
        )
        .all()
    )
    daily_map = {d.user_id: d for d in dailies}

    # Open sessions & breaks
    open_sessions_map = {
        s.user_id: s
        for s in db.query(AttendanceSession)
        .filter(
            AttendanceSession.user_id.in_(staff_ids),
            AttendanceSession.check_out.is_(None),
        )
        .all()
    }
    open_breaks_map = {
        b.user_id: b
        for b in db.query(AttendanceBreak)
        .filter(
            AttendanceBreak.user_id.in_(staff_ids),
            AttendanceBreak.end_time.is_(None),
        )
        .all()
    }

    leaves = (
        db.query(UserLeave.user_id)
        .filter(
            UserLeave.user_id.in_(staff_ids),
            UserLeave.leave_date == target_date,
            UserLeave.status == "Approved",
        )
        .all()
    )
    leave_set = {r[0] for r in leaves}

    records: list[AttendanceRecordItem] = []

    for user in staff_users:
        prof = profile_map.get(user.id)
        dept = prof.department if prof else None

        # Filter by department
        if department and dept != department:
            continue

        # Filter by query (name or email)
        if q:
            term = q.strip().lower()
            if term not in user.full_name.lower() and term not in user.email.lower():
                continue

        daily = daily_map.get(user.id)
        open_sess = open_sessions_map.get(user.id)
        open_brk = open_breaks_map.get(user.id)
        has_leave = user.id in leave_set

        stat, _ = compute_staff_status_for_date(
            user=user,
            daily=daily,
            open_break=open_brk,
            has_leave=has_leave,
            target_date=target_date,
            policy=policy,
        )

        # Filter by status
        if status_filter and status_filter != "All":
            if status_filter == "Present" and stat not in ("Present", "On Break"):
                continue
            elif status_filter == "On Break" and stat != "On Break":
                continue
            elif status_filter == "Late" and stat != "Late":
                continue
            elif status_filter == "Absent" and stat != "Absent":
                continue
            elif status_filter == "Not Checked In" and stat != "Not Checked In":
                continue
            elif status_filter == "On Leave" and stat != "On Leave":
                continue

        # Compute counts & totals
        sess_count = len(daily.sessions) if daily else 0
        total_work = daily.total_work_minutes if daily else 0
        total_break = daily.total_break_minutes if daily else 0
        net_work = daily.net_work_minutes if daily else 0

        # Add live minutes if today and session is active
        now_local = local_now(policy)
        if target_date == now_local.date() and open_sess:
            live_add = max(0, int((utc_now() - ensure_utc(open_sess.check_in)).total_seconds() / 60))
            total_work += live_add
            deducted_live_break = 0
            if open_brk and open_brk.is_deducted:
                deducted_live_break = max(0, int((utc_now() - ensure_utc(open_brk.start_time)).total_seconds() / 60))
            net_work = max(0, (net_work + live_add) - deducted_live_break)

        records.append(
            AttendanceRecordItem(
                id=daily.id if daily else None,
                user_id=user.id,
                full_name=user.full_name,
                email=user.email,
                role=user.role,
                department=dept,
                date=target_date,
                status=stat,
                first_check_in=daily.first_check_in if daily else None,
                last_check_out=daily.last_check_out if daily else None,
                sessions_count=sess_count,
                total_work_minutes=total_work,
                total_break_minutes=total_break,
                net_work_minutes=net_work,
                is_on_break=open_brk is not None,
                is_checked_in=open_sess is not None,
                active_break_type=open_brk.break_type if open_brk else None,
            )
        )

    return records


def get_monthly_staff_report(
    db: Session,
    current_user: User,
    year: int,
    month: int,
    department: str | None = None,
) -> list[MonthlyStaffAttendanceSummary]:
    policy = get_default_policy(db)
    staff_users = get_authorized_staff_users(db, current_user)
    staff_ids = [u.id for u in staff_users]

    profiles = db.query(StaffProfile).filter(StaffProfile.user_id.in_(staff_ids)).all()
    profile_map = {p.user_id: p for p in profiles}

    # Month date range
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)

    today_local = local_now(policy).date()
    # Don't evaluate future dates beyond today
    eval_end_date = min(end_date, today_local)

    # Batch query daily attendances in month
    dailies = (
        db.query(DailyAttendance)
        .filter(
            DailyAttendance.user_id.in_(staff_ids),
            DailyAttendance.date >= start_date,
            DailyAttendance.date <= eval_end_date,
        )
        .all()
    )
    user_dailies: dict[int, list[DailyAttendance]] = {uid: [] for uid in staff_ids}
    for d in dailies:
        user_dailies[d.user_id].append(d)

    # Batch query leaves in month
    leaves = (
        db.query(UserLeave)
        .filter(
            UserLeave.user_id.in_(staff_ids),
            UserLeave.leave_date >= start_date,
            UserLeave.leave_date <= eval_end_date,
            UserLeave.status == "Approved",
        )
        .all()
    )
    user_leaves: dict[int, set[date]] = {uid: set() for uid in staff_ids}
    for lv in leaves:
        user_leaves[lv.user_id].add(lv.leave_date)

    summaries: list[MonthlyStaffAttendanceSummary] = []

    for user in staff_users:
        prof = profile_map.get(user.id)
        dept = prof.department if prof else None

        if department and dept != department:
            continue

        d_list = user_dailies.get(user.id, [])
        date_map = {d.date: d for d in d_list}
        leave_dates = user_leaves.get(user.id, set())

        present_days = 0
        late_days = 0
        absent_days = 0
        leave_days = 0
        total_net_minutes = 0

        # Iterate through working days in month up to eval_end_date (excluding Sundays if desired, or all weekdays)
        curr = start_date
        while curr <= eval_end_date:
            # Check if weekend (e.g., Sunday = 6)
            is_weekend = curr.weekday() == 6
            d = date_map.get(curr)

            if d and d.first_check_in:
                if d.status == "Late":
                    late_days += 1
                else:
                    present_days += 1
                total_net_minutes += d.net_work_minutes
            elif curr in leave_dates:
                leave_days += 1
            elif not is_weekend:
                # If today and before cutoff, not yet absent
                if curr == today_local and local_now(policy).time() < policy.cutoff_time:
                    pass
                else:
                    absent_days += 1

            curr += timedelta(days=1)

        total_working_days = present_days + late_days + absent_days + leave_days
        total_hours = round(total_net_minutes / 60.0, 1)
        actual_worked_days = present_days + late_days
        avg_hours = round(total_hours / actual_worked_days, 1) if actual_worked_days > 0 else 0.0

        summaries.append(
            MonthlyStaffAttendanceSummary(
                user_id=user.id,
                full_name=user.full_name,
                email=user.email,
                role=user.role,
                department=dept,
                total_working_days=total_working_days,
                present_days=present_days,
                late_days=late_days,
                absent_days=absent_days,
                leave_days=leave_days,
                total_net_work_hours=total_hours,
                avg_daily_hours=avg_hours,
            )
        )

    return summaries
