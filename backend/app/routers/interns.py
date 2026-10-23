from datetime import date, datetime, timedelta
import math
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies.auth import get_current_user, get_db
from app.dependencies.permissions import require_admin, require_project_reader
from app.models.attendance import DailyAttendance
from app.models.project import Project, ProjectMember
from app.models.staff_profile import StaffCategory, StaffProfile
from app.models.task import Task, TaskAssignment
from app.models.user import User
from app.schemas.pagination import PageResponse
from app.schemas.staff_management import (
    AttendanceHistoryItem,
    InternCreate,
    InternDetails,
    InternStats,
    InternSummaryItem,
    InternUpdate,
    MentorSummary,
    SimpleAttendanceSummary,
    SimpleProjectSummary,
    SimpleTaskSummary,
)
from app.security import hash_password

router = APIRouter(prefix="/api/interns", tags=["Interns Management"])


@router.get("/stats", response_model=InternStats)
def get_intern_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    base_query = db.query(User).filter(
        or_(
            User.role == "intern",
            User.id.in_(
                db.query(StaffProfile.user_id).filter(
                    StaffProfile.staff_category == StaffCategory.INTERN
                )
            ),
        )
    )

    total_interns = base_query.count()
    active_interns = (
        db.query(User)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .filter(
            User.role == "intern",
            User.status == "active",
            or_(
                StaffProfile.internship_status == "Active",
                StaffProfile.internship_status.is_(None),
            ),
        )
        .count()
    )
    completed_interns = (
        db.query(User)
        .join(StaffProfile, StaffProfile.user_id == User.id)
        .filter(
            User.role == "intern",
            StaffProfile.internship_status == "Completed",
        )
        .count()
    )
    inactive_interns = base_query.filter(User.status == "inactive").count()

    today = date.today()
    soon_cutoff = today + timedelta(days=14)
    ending_soon = (
        db.query(User)
        .join(StaffProfile, StaffProfile.user_id == User.id)
        .filter(
            User.role == "intern",
            User.status == "active",
            StaffProfile.internship_end_date.isnot(None),
            StaffProfile.internship_end_date >= today,
            StaffProfile.internship_end_date <= soon_cutoff,
            or_(
                StaffProfile.internship_status == "Active",
                StaffProfile.internship_status.is_(None),
            ),
        )
        .count()
    )

    return InternStats(
        total_interns=total_interns,
        active_interns=active_interns,
        completed_interns=completed_interns,
        inactive_interns=inactive_interns,
        ending_soon=ending_soon,
    )


@router.get("/mentors")
def list_available_mentors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    mentors = (
        db.query(User, StaffProfile.department)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .filter(
            User.role.in_(("admin", "manager")),
            User.status == "active",
        )
        .order_by(User.full_name)
        .all()
    )
    return [
        {
            "id": u.id,
            "full_name": u.full_name or u.email,
            "email": u.email,
            "role": u.role,
            "department": dept or "Ingage",
        }
        for u, dept in mentors
    ]


@router.get("/projects")
def list_available_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    projects = (
        db.query(Project.id, Project.name, Project.department, Project.status)
        .order_by(Project.name)
        .all()
    )
    return [
        {"id": p[0], "name": p[1], "department": p[2], "status": p[3]}
        for p in projects
    ]


@router.get("", response_model=PageResponse[InternSummaryItem])
def list_interns(
    q: Optional[str] = Query(default=None, max_length=200),
    mentor_id: Optional[int] = None,
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    sort_by: str = Query(default="name", pattern="^(name|intern_id|start_date|end_date|progress|college)$"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    today = date.today()
    soon_cutoff = today + timedelta(days=14)

    query = (
        db.query(User, StaffProfile)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .filter(
            or_(
                User.role == "intern",
                StaffProfile.staff_category == StaffCategory.INTERN,
            )
        )
    )

    if q and isinstance(q, str) and q.strip():
        search_pattern = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(User.full_name).ilike(search_pattern),
                func.lower(User.email).ilike(search_pattern),
                func.lower(StaffProfile.intern_id).ilike(search_pattern),
                func.lower(StaffProfile.staff_id).ilike(search_pattern),
                func.lower(StaffProfile.institution).ilike(search_pattern),
            )
        )

    if mentor_id and isinstance(mentor_id, int):
        query = query.filter(StaffProfile.reporting_manager_id == mentor_id)

    if project_id and isinstance(project_id, int):
        project_user_ids = db.query(ProjectMember.user_id).filter(ProjectMember.project_id == project_id)
        query = query.filter(User.id.in_(project_user_ids))

    if department and isinstance(department, str) and department != "All":
        query = query.filter(StaffProfile.department == department)

    if status and isinstance(status, str) and status != "All":
        if status == "Ending Soon":
            query = query.filter(
                User.status == "active",
                StaffProfile.internship_end_date.isnot(None),
                StaffProfile.internship_end_date >= today,
                StaffProfile.internship_end_date <= soon_cutoff,
            )
        elif status == "Completed":
            query = query.filter(StaffProfile.internship_status == "Completed")
        elif status == "Active":
            query = query.filter(
                User.status == "active",
                or_(
                    StaffProfile.internship_status == "Active",
                    StaffProfile.internship_status.is_(None),
                ),
            )
        elif status == "Inactive":
            query = query.filter(User.status == "inactive")

    # Sorting
    sort_by_val = sort_by if isinstance(sort_by, str) else "name"
    sort_dir_val = sort_dir if isinstance(sort_dir, str) else "asc"
    page_val = page if isinstance(page, int) else 1
    page_size_val = page_size if isinstance(page_size, int) else 10

    if sort_by_val == "name":
        order_col = User.full_name
    elif sort_by_val == "intern_id":
        order_col = StaffProfile.intern_id
    elif sort_by_val == "start_date":
        order_col = StaffProfile.joining_date
    elif sort_by_val == "end_date":
        order_col = StaffProfile.internship_end_date
    elif sort_by_val == "college":
        order_col = StaffProfile.institution
    else:
        order_col = User.id

    if sort_dir_val == "desc":
        query = query.order_by(order_col.desc().nulls_last(), User.id.desc())
    else:
        query = query.order_by(order_col.asc().nulls_last(), User.id.asc())

    total = query.count()
    offset = (page_val - 1) * page_size_val
    records = query.offset(offset).limit(page_size_val).all()

    user_ids = [user.id for user, _ in records]

    # Pre-fetch mentors
    mentor_ids = [p.reporting_manager_id for _, p in records if p and p.reporting_manager_id]
    mentors_map = {}
    if mentor_ids:
        mgr_rows = db.query(User).filter(User.id.in_(mentor_ids)).all()
        for m in mgr_rows:
            mentors_map[m.id] = MentorSummary(id=m.id, full_name=m.full_name, email=m.email)

    # Pre-fetch today's attendance
    attendances_by_user = {}
    if user_ids:
        today_records = (
            db.query(DailyAttendance)
            .filter(DailyAttendance.user_id.in_(user_ids), DailyAttendance.date == today)
            .all()
        )
        for att in today_records:
            attendances_by_user[att.user_id] = att

    # Pre-fetch assigned projects
    projects_by_user = {}
    if user_ids:
        proj_rows = (
            db.query(ProjectMember.user_id, Project.id, Project.name, Project.department, Project.status)
            .join(Project, Project.id == ProjectMember.project_id)
            .filter(ProjectMember.user_id.in_(user_ids))
            .all()
        )
        for uid, pid, pname, pdept, pstat in proj_rows:
            projects_by_user.setdefault(uid, []).append(
                SimpleProjectSummary(id=pid, name=pname, department=pdept, status=pstat)
            )

    # Pre-fetch tasks and compute progress
    tasks_by_user = {}
    if user_ids:
        task_rows = (
            db.query(TaskAssignment.user_id, Task.id, Task.status, Task.progress)
            .join(Task, Task.id == TaskAssignment.task_id)
            .filter(TaskAssignment.user_id.in_(user_ids))
            .all()
        )
        for uid, tid, tstat, tprog in task_rows:
            tasks_by_user.setdefault(uid, []).append((tstat, tprog))

    items = []
    for user, profile in records:
        iid = (
            (profile.intern_id if profile else None)
            or (profile.staff_id if profile else None)
            or f"INT-{user.id:04d}"
        )
        s_date = profile.joining_date if profile else None
        e_date = profile.internship_end_date if profile else None

        duration_weeks = None
        if s_date and e_date and e_date >= s_date:
            duration_weeks = max(1, round((e_date - s_date).days / 7))

        days_remaining = None
        is_ending_soon = False
        if e_date and user.status == "active":
            days_remaining = (e_date - today).days
            if 0 <= days_remaining <= 14:
                is_ending_soon = True

        # Calculate task progress
        user_tasks = tasks_by_user.get(user.id, [])
        total_t = len(user_tasks)
        completed_t = sum(1 for tstat, _ in user_tasks if tstat in ("Completed", "Reviewed"))
        if total_t > 0:
            avg_progress = round(sum(tprog for _, tprog in user_tasks) / total_t)
        else:
            avg_progress = 0

        att = attendances_by_user.get(user.id)
        if att:
            today_att = SimpleAttendanceSummary(
                status=att.status,
                check_in=att.first_check_in.strftime("%I:%M %p") if att.first_check_in else None,
                check_out=att.last_check_out.strftime("%I:%M %p") if att.last_check_out else None,
                work_minutes=att.net_work_minutes or 0,
                break_minutes=att.total_break_minutes or 0,
            )
        else:
            today_att = SimpleAttendanceSummary(status="Not Checked In")

        int_status = profile.internship_status if profile and profile.internship_status else "Active"
        if is_ending_soon and int_status == "Active":
            badge_status = "Ending Soon"
        else:
            badge_status = int_status

        items.append(
            InternSummaryItem(
                id=user.id,
                intern_id=iid,
                full_name=user.full_name or "Unnamed Intern",
                email=user.email,
                profile_photo=profile.profile_photo if profile else None,
                college=profile.institution if profile else None,
                department=profile.department if profile else "Ingage",
                mentor=mentors_map.get(profile.reporting_manager_id) if profile and profile.reporting_manager_id else None,
                assigned_projects=projects_by_user.get(user.id, []),
                internship_start_date=s_date,
                internship_end_date=e_date,
                duration_weeks=duration_weeks,
                is_ending_soon=is_ending_soon,
                days_remaining=days_remaining,
                task_completion_progress=avg_progress,
                tasks_count=total_t,
                completed_tasks_count=completed_t,
                internship_status=badge_status,
                account_status=user.status,
                today_attendance=today_att,
            )
        )

    pages = math.ceil(total / page_size_val) if total > 0 else 1
    return PageResponse(
        items=items,
        total=total,
        page=page_val,
        page_size=page_size_val,
        pages=pages,
    )


@router.get("/{user_id}", response_model=InternDetails)
def get_intern_details(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            or_(
                User.role == "intern",
                User.id.in_(
                    db.query(StaffProfile.user_id).filter(
                        StaffProfile.staff_category == StaffCategory.INTERN
                    )
                ),
            ),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Intern not found")

    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()

    mentor = None
    if profile and profile.reporting_manager_id:
        mgr = db.query(User).filter(User.id == profile.reporting_manager_id).first()
        if mgr:
            mgr_profile = db.query(StaffProfile).filter(StaffProfile.user_id == mgr.id).first()
            mentor = MentorSummary(
                id=mgr.id,
                full_name=mgr.full_name,
                email=mgr.email,
                department=mgr_profile.department if mgr_profile else None,
            )

    # Assigned projects
    assigned_projects = (
        db.query(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .filter(ProjectMember.user_id == user.id)
        .order_by(Project.start_date.desc())
        .all()
    )
    project_summaries = [
        SimpleProjectSummary(
            id=p.id,
            name=p.name,
            department=p.department,
            status=p.status,
        )
        for p in assigned_projects
    ]

    # Assigned tasks
    tasks = (
        db.query(Task)
        .join(TaskAssignment, TaskAssignment.task_id == Task.id)
        .filter(TaskAssignment.user_id == user.id)
        .order_by(Task.due_date.asc().nulls_last())
        .all()
    )
    task_summaries = []
    completed_tasks = 0
    total_progress = 0
    for t in tasks:
        if t.status in ("Completed", "Reviewed"):
            completed_tasks += 1
        total_progress += (t.progress or 0)
        task_summaries.append(
            SimpleTaskSummary(
                id=t.id,
                title=t.title,
                priority=t.priority,
                status=t.status,
                progress=t.progress,
                due_date=t.due_date,
                project_id=t.project_id,
                project_name=t.project.name if t.project else None,
            )
        )

    total_tasks = len(tasks)
    avg_progress = round(total_progress / total_tasks) if total_tasks > 0 else 0

    # Recent attendance history
    history_records = (
        db.query(DailyAttendance)
        .filter(DailyAttendance.user_id == user.id)
        .order_by(DailyAttendance.date.desc())
        .limit(30)
        .all()
    )
    attendance_history = [
        AttendanceHistoryItem(
            id=h.id,
            date=h.date,
            status=h.status,
            first_check_in=h.first_check_in,
            last_check_out=h.last_check_out,
            net_work_minutes=h.net_work_minutes or 0,
            total_break_minutes=h.total_break_minutes or 0,
        )
        for h in history_records
    ]

    today = date.today()
    s_date = profile.joining_date if profile else None
    e_date = profile.internship_end_date if profile else None
    duration_weeks = None
    if s_date and e_date and e_date >= s_date:
        duration_weeks = max(1, round((e_date - s_date).days / 7))

    days_remaining = None
    is_ending_soon = False
    if e_date and user.status == "active":
        days_remaining = (e_date - today).days
        if 0 <= days_remaining <= 14:
            is_ending_soon = True

    iid = (
        (profile.intern_id if profile else None)
        or (profile.staff_id if profile else None)
        or f"INT-{user.id:04d}"
    )

    return InternDetails(
        id=user.id,
        full_name=user.full_name or "Unnamed Intern",
        email=user.email,
        role=user.role,
        status=user.status,
        intern_id=iid,
        mobile=profile.mobile if profile else None,
        college=profile.institution if profile else None,
        department=profile.department if profile else "Ingage",
        designation=profile.designation if profile else "Intern",
        internship_start_date=s_date,
        internship_end_date=e_date,
        duration_weeks=duration_weeks,
        is_ending_soon=is_ending_soon,
        days_remaining=days_remaining,
        work_location=profile.work_location if profile else None,
        skills=profile.skills if profile and isinstance(profile.skills, list) else None,
        internship_status=profile.internship_status if profile and profile.internship_status else "Active",
        mentor=mentor,
        assigned_projects=project_summaries,
        tasks=task_summaries,
        attendance_history=attendance_history,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        task_completion_progress=avg_progress,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_intern(
    data: InternCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    email = data.email.strip().lower()
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user = User(
        email=email,
        full_name=data.full_name.strip(),
        password_hash=hash_password(data.password),
        role="intern",
        status="active",
        must_change_password=False,
        onboarding_status="completed",
        profile_status="complete",
    )
    db.add(user)
    db.flush()

    intern_id = f"INT-{user.id:04d}"
    s_date = None
    if data.start_date:
        try:
            s_date = date.fromisoformat(data.start_date)
        except (ValueError, TypeError):
            pass

    e_date = None
    if data.end_date:
        try:
            e_date = date.fromisoformat(data.end_date)
        except (ValueError, TypeError):
            pass

    profile = StaffProfile(
        user_id=user.id,
        staff_category=StaffCategory.INTERN,
        staff_id=intern_id,
        intern_id=intern_id,
        department=data.department or "Ingage",
        designation="Intern",
        institution=data.college,
        joining_date=s_date or date.today(),
        internship_end_date=e_date,
        internship_status="Active",
        mobile=data.mobile,
        work_location=data.work_location,
        reporting_manager_id=data.mentor_id,
    )
    db.add(profile)
    db.commit()
    db.refresh(user)

    return {
        "message": "Intern created successfully.",
        "id": user.id,
        "intern_id": intern_id,
        "email": user.email,
        "full_name": user.full_name,
    }


@router.patch("/{user_id}")
def update_intern(
    user_id: int,
    data: InternUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Intern not found")

    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    if not profile:
        profile = StaffProfile(
            user_id=user.id,
            staff_category=StaffCategory.INTERN,
            intern_id=f"INT-{user.id:04d}",
            staff_id=f"INT-{user.id:04d}",
        )
        db.add(profile)
        db.flush()

    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.mobile is not None:
        profile.mobile = data.mobile.strip() if data.mobile else None
    if data.college is not None:
        profile.institution = data.college
    if data.department is not None:
        profile.department = data.department
    if data.mentor_id is not None:
        profile.reporting_manager_id = data.mentor_id
    if data.start_date is not None:
        try:
            profile.joining_date = date.fromisoformat(data.start_date) if data.start_date else None
        except (ValueError, TypeError):
            pass
    if data.end_date is not None:
        try:
            profile.internship_end_date = date.fromisoformat(data.end_date) if data.end_date else None
        except (ValueError, TypeError):
            pass
    if data.work_location is not None:
        profile.work_location = data.work_location
    if data.internship_status is not None:
        profile.internship_status = data.internship_status
    if data.degree is not None:
        profile.degree = data.degree
    if data.graduation_year is not None:
        profile.graduation_year = data.graduation_year
    if data.skills is not None:
        if isinstance(data.skills, str):
            profile.skills = [s.strip() for s in data.skills.split(",") if s.strip()]
        elif isinstance(data.skills, list):
            profile.skills = data.skills

    db.commit()
    db.refresh(user)
    db.refresh(profile)

    return {
        "message": "Intern updated successfully.",
        "id": user.id,
        "full_name": user.full_name,
    }


@router.patch("/{user_id}/status")
def update_intern_status(
    user_id: int,
    status_data: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Intern not found")

    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()

    account_status = status_data.get("account_status")
    if account_status and account_status in ("active", "inactive"):
        user.status = account_status

    internship_status = status_data.get("internship_status")
    if internship_status and profile:
        profile.internship_status = internship_status

    db.commit()
    db.refresh(user)

    return {
        "message": "Intern status updated successfully.",
        "account_status": user.status,
        "internship_status": profile.internship_status if profile else None,
    }
