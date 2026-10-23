from datetime import date, datetime
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
    EmployeeCreate,
    EmployeeDetails,
    EmployeeStats,
    EmployeeSummaryItem,
    EmployeeUpdate,
    MentorSummary,
    SimpleAttendanceSummary,
    SimpleProjectSummary,
    SimpleTaskSummary,
)
from app.security import hash_password

router = APIRouter(prefix="/api/employees", tags=["Employees Management"])


@router.get("/stats", response_model=EmployeeStats)
def get_employee_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    base_query = db.query(User).filter(
        or_(
            User.role == "employee",
            User.id.in_(
                db.query(StaffProfile.user_id).filter(
                    StaffProfile.staff_category == StaffCategory.EMPLOYEE
                )
            ),
        )
    )

    total_employees = base_query.count()
    active_employees = base_query.filter(User.status == "active").count()
    inactive_employees = base_query.filter(User.status == "inactive").count()

    today = date.today()
    present_today = (
        db.query(DailyAttendance.id)
        .join(User, User.id == DailyAttendance.user_id)
        .filter(
            User.role == "employee",
            DailyAttendance.date == today,
            DailyAttendance.status.in_(("Present", "Late", "On Break")),
        )
        .count()
    )

    # Departments distribution
    dept_rows = (
        db.query(StaffProfile.department, func.count(User.id))
        .join(User, User.id == StaffProfile.user_id)
        .filter(User.role == "employee")
        .group_by(StaffProfile.department)
        .all()
    )
    departments = [
        {"name": row[0] or "Unassigned", "count": row[1]}
        for row in dept_rows
        if row[0] or row[1] > 0
    ]

    return EmployeeStats(
        total_employees=total_employees,
        active_employees=active_employees,
        inactive_employees=inactive_employees,
        present_today=present_today,
        departments=departments,
    )


@router.get("", response_model=PageResponse[EmployeeSummaryItem])
def list_employees(
    q: Optional[str] = Query(default=None, max_length=200),
    department: Optional[str] = None,
    status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"),
    attendance_status: Optional[str] = None,
    sort_by: str = Query(default="name", pattern="^(name|employee_id|department|joining_date|status)$"),
    sort_dir: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    query = (
        db.query(User, StaffProfile)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .filter(
            or_(
                User.role == "employee",
                StaffProfile.staff_category == StaffCategory.EMPLOYEE,
            )
        )
    )

    if q and isinstance(q, str) and q.strip():
        search_pattern = f"%{q.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(User.full_name).ilike(search_pattern),
                func.lower(User.email).ilike(search_pattern),
                func.lower(StaffProfile.employee_id).ilike(search_pattern),
                func.lower(StaffProfile.staff_id).ilike(search_pattern),
                func.lower(StaffProfile.designation).ilike(search_pattern),
            )
        )

    if department and isinstance(department, str) and department != "All":
        query = query.filter(StaffProfile.department == department)

    if status and isinstance(status, str) and status != "All":
        query = query.filter(User.status == status)

    today = date.today()
    if attendance_status and isinstance(attendance_status, str) and attendance_status != "All":
        if attendance_status == "Not Checked In":
            checked_in_subquery = (
                db.query(DailyAttendance.user_id)
                .filter(DailyAttendance.date == today)
            )
            query = query.filter(User.id.not_in(checked_in_subquery))
        else:
            query = query.join(
                DailyAttendance,
                (DailyAttendance.user_id == User.id) & (DailyAttendance.date == today),
            ).filter(DailyAttendance.status == attendance_status)

    # Sorting
    sort_by_val = sort_by if isinstance(sort_by, str) else "name"
    sort_dir_val = sort_dir if isinstance(sort_dir, str) else "asc"
    page_val = page if isinstance(page, int) else 1
    page_size_val = page_size if isinstance(page_size, int) else 10

    if sort_by_val == "name":
        order_col = User.full_name
    elif sort_by_val == "employee_id":
        order_col = StaffProfile.employee_id
    elif sort_by_val == "department":
        order_col = StaffProfile.department
    elif sort_by_val == "joining_date":
        order_col = StaffProfile.joining_date
    elif sort_by_val == "status":
        order_col = User.status
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

    # Pre-fetch today's attendance for the returned page
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

    # Pre-fetch tasks count
    tasks_count_by_user = {}
    if user_ids:
        task_rows = (
            db.query(TaskAssignment.user_id, func.count(TaskAssignment.task_id))
            .filter(TaskAssignment.user_id.in_(user_ids))
            .group_by(TaskAssignment.user_id)
            .all()
        )
        for uid, count in task_rows:
            tasks_count_by_user[uid] = count

    items = []
    for user, profile in records:
        emp_id = (
            (profile.employee_id if profile else None)
            or (profile.staff_id if profile else None)
            or f"EMP-{user.id:04d}"
        )
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

        items.append(
            EmployeeSummaryItem(
                id=user.id,
                employee_id=emp_id,
                full_name=user.full_name or "Unnamed Employee",
                email=user.email,
                profile_photo=profile.profile_photo if profile else None,
                department=profile.department if profile else "Ingage",
                designation=profile.designation if profile else "Employee",
                joining_date=profile.joining_date if profile else None,
                status=user.status,
                assigned_projects=projects_by_user.get(user.id, []),
                today_attendance=today_att,
                tasks_count=tasks_count_by_user.get(user.id, 0),
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


@router.get("/{user_id}", response_model=EmployeeDetails)
def get_employee_details(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    user = (
        db.query(User)
        .filter(
            User.id == user_id,
            or_(
                User.role == "employee",
                User.id.in_(
                    db.query(StaffProfile.user_id).filter(
                        StaffProfile.staff_category == StaffCategory.EMPLOYEE
                    )
                ),
            ),
        )
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

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
    for t in tasks:
        if t.status in ("Completed", "Reviewed"):
            completed_tasks += 1
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
    rate = round((completed_tasks / total_tasks * 100), 1) if total_tasks > 0 else 0.0

    # Recent attendance history (last 30 days)
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

    emp_id = (
        (profile.employee_id if profile else None)
        or (profile.staff_id if profile else None)
        or f"EMP-{user.id:04d}"
    )

    return EmployeeDetails(
        id=user.id,
        full_name=user.full_name or "Unnamed Employee",
        email=user.email,
        role=user.role,
        status=user.status,
        employee_id=emp_id,
        mobile=profile.mobile if profile else None,
        department=profile.department if profile else "Ingage",
        designation=profile.designation if profile else "Employee",
        joining_date=profile.joining_date if profile else None,
        work_location=profile.work_location if profile else None,
        dob=profile.dob if profile else None,
        gender=profile.gender if profile else None,
        address=profile.address if profile else None,
        city=profile.city if profile else None,
        skills=profile.skills if profile and isinstance(profile.skills, list) else None,
        highest_qualification=profile.highest_qualification if profile else None,
        institution=profile.institution if profile else None,
        degree=profile.degree if profile else None,
        graduation_year=profile.graduation_year if profile else None,
        resume_url=profile.resume_url if profile else None,
        reporting_manager=mentor,
        assigned_projects=project_summaries,
        tasks=task_summaries,
        attendance_history=attendance_history,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        task_completion_rate=rate,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
def create_employee(
    data: EmployeeCreate,
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
        role="employee",
        status="active",
        must_change_password=False,
        onboarding_status="completed",
        profile_status="complete",
    )
    db.add(user)
    db.flush()

    staff_id = f"EMP-{user.id:04d}"
    jdate = None
    if data.joining_date:
        try:
            jdate = date.fromisoformat(data.joining_date)
        except (ValueError, TypeError):
            pass

    profile = StaffProfile(
        user_id=user.id,
        staff_category=StaffCategory.EMPLOYEE,
        staff_id=staff_id,
        employee_id=staff_id,
        department=data.department or "Ingage",
        designation=data.designation or "Employee",
        joining_date=jdate or date.today(),
        mobile=data.mobile,
        work_location=data.work_location,
        reporting_manager_id=data.reporting_manager_id,
    )
    db.add(profile)
    db.commit()
    db.refresh(user)

    return {
        "message": "Employee created successfully.",
        "id": user.id,
        "employee_id": staff_id,
        "email": user.email,
        "full_name": user.full_name,
    }


@router.patch("/{user_id}")
def update_employee(
    user_id: int,
    data: EmployeeUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    if not profile:
        profile = StaffProfile(
            user_id=user.id,
            staff_category=StaffCategory.EMPLOYEE,
            employee_id=f"EMP-{user.id:04d}",
            staff_id=f"EMP-{user.id:04d}",
        )
        db.add(profile)
        db.flush()

    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.mobile is not None:
        profile.mobile = data.mobile.strip() if data.mobile else None
    if data.department is not None:
        profile.department = data.department
    if data.designation is not None:
        profile.designation = data.designation
    if data.work_location is not None:
        profile.work_location = data.work_location
    if data.reporting_manager_id is not None:
        profile.reporting_manager_id = data.reporting_manager_id
    if data.joining_date is not None:
        try:
            profile.joining_date = date.fromisoformat(data.joining_date) if data.joining_date else None
        except (ValueError, TypeError):
            pass
    if data.dob is not None:
        try:
            profile.dob = date.fromisoformat(data.dob) if data.dob else None
        except (ValueError, TypeError):
            pass
    if data.gender is not None:
        profile.gender = data.gender
    if data.address is not None:
        profile.address = data.address
    if data.city is not None:
        profile.city = data.city
    if data.highest_qualification is not None:
        profile.highest_qualification = data.highest_qualification
    if data.institution is not None:
        profile.institution = data.institution
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
        "message": "Employee updated successfully.",
        "id": user.id,
        "full_name": user.full_name,
    }


@router.patch("/{user_id}/status")
def update_employee_status(
    user_id: int,
    status_data: dict,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")

    new_status = status_data.get("status")
    if new_status not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'inactive'")

    user.status = new_status
    db.commit()
    db.refresh(user)

    return {"message": f"Employee status updated to {new_status}.", "status": user.status}
