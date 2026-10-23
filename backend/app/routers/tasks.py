from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, cast, func, or_, String
from sqlalchemy.orm import Session, joinedload

from app.dependencies.auth import get_current_user, get_db
from app.models.project import Project, ProjectMember
from app.models.staff_profile import StaffProfile
from app.models.task import DailyWorkUpdate, Notification, Task, TaskActivity, TaskAssignment
from app.models.user import User
from app.schemas.pagination import PageResponse
from app.schemas.tasks import (
    DailyWorkUpdateCreate,
    DailyWorkUpdateResponse,
    TaskActivityItem,
    TaskAssigneeSummary,
    TaskAssignRequest,
    TaskCreate,
    PersonalTaskCreate,
    TaskProgressUpdate,
    TaskProjectSummary,
    TaskResponse,
    TaskReviewAction,
    TaskSubmitReview,
    TaskSummaryCounts,
    TaskUpdate,
    TaskUserSummary,
)


router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


def can_manage_project(project: Project | None, user: User) -> bool:
    if user.role == "admin":
        return True
    if user.role == "manager":
        if project is None:
            return True
        return project.manager_id == user.id
    return False


def can_edit_task(task: Task, user: User) -> bool:
    if user.role == "admin":
        return True
    if user.role == "manager":
        if task.project is None:
            return True
        return task.project.manager_id == user.id or task.assigned_by_id == user.id
    if task.assigned_by_id == user.id:
        return True
    if task.project_id is None and any(a.user_id == user.id for a in task.assignments):
        return True
    return False


def can_delete_task(task: Task, user: User) -> bool:
    if user.role == "admin":
        return True
    if user.role == "manager":
        if task.project is None:
            return True
        return task.project.manager_id == user.id or task.assigned_by_id == user.id
    if task.assigned_by_id == user.id:
        return True
    if task.project_id is None and any(a.user_id == user.id for a in task.assignments):
        return True
    return False



def scoped_tasks(db: Session, user: User, my_tasks_only: bool = False):
    query = db.query(Task)
    if my_tasks_only:
        return query.filter(Task.assignments.any(TaskAssignment.user_id == user.id))

    if user.role == "admin":
        return query

    if user.role == "manager":
        return query.filter(
            or_(
                Task.project.has(Project.manager_id == user.id),
                Task.assignments.any(TaskAssignment.user_id == user.id),
                Task.assigned_by_id == user.id,
                Task.project_id.is_(None),
            )
        )

    # Employee, Intern, Vendor can only access their assigned tasks
    return query.filter(Task.assignments.any(TaskAssignment.user_id == user.id))


def get_task_or_404(db: Session, task_id: int, user: User) -> Task:
    task = scoped_tasks(db, user).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found or access denied.",
        )
    return task


def serialize_assignee(user: User, profile: StaffProfile | None = None) -> TaskAssigneeSummary:
    category = None
    dept = None
    if profile:
        category = profile.staff_category.value if hasattr(profile.staff_category, "value") else profile.staff_category
        dept = profile.department
    return TaskAssigneeSummary(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role=user.role,
        staff_category=category,
        department=dept,
        company_unit=dept,
        avatar_url=None,
    )


def build_task_response(task: Task, db: Session) -> TaskResponse:
    # Fetch profiles for assignees
    assignee_ids = [a.user_id for a in task.assignments]
    profiles = {}
    if assignee_ids:
        rows = db.query(StaffProfile).filter(StaffProfile.user_id.in_(assignee_ids)).all()
        profiles = {p.user_id: p for p in rows}

    assignees_list = []
    seen_assignee_ids = set()
    for assignment in task.assignments:
        u = assignment.user
        if u and u.id not in seen_assignee_ids:
            seen_assignee_ids.add(u.id)
            prof = profiles.get(u.id)
            assignees_list.append(serialize_assignee(u, prof))

    activities_list = []
    for act in task.activities:
        u = act.user
        user_summary = TaskUserSummary(
            id=u.id if u else 0,
            full_name=u.full_name if u else "System",
            email=u.email if u else "",
            role=u.role if u else "",
        )
        activities_list.append(
            TaskActivityItem(
                id=act.id,
                action=act.action,
                comment=act.comment,
                created_at=act.created_at,
                user=user_summary,
            )
        )

    assigned_by_summary = None
    if task.assigned_by:
        assigned_by_summary = TaskUserSummary(
            id=task.assigned_by.id,
            full_name=task.assigned_by.full_name,
            email=task.assigned_by.email,
            role=task.assigned_by.role,
        )

    project_summary = None
    if task.project:
        project_summary = TaskProjectSummary(
            id=task.project.id,
            name=task.project.name,
            department=task.project.department.value if hasattr(task.project.department, "value") else str(task.project.department),
            status=task.project.status.value if hasattr(task.project.status, "value") else str(task.project.status),
        )

    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        project_id=task.project_id,
        project=project_summary,
        assigned_by=assigned_by_summary,
        assignment_type=task.assignment_type or "Individual",
        priority=task.priority or "Medium",
        start_date=task.start_date,
        due_date=task.due_date,
        estimated_hours=float(task.estimated_hours) if task.estimated_hours is not None else None,
        progress=task.progress or 0,
        status=task.status,
        submission_notes=task.submission_notes,
        review_comments=task.review_comments,
        created_at=task.created_at,
        updated_at=task.updated_at,
        assignees=assignees_list,
        activities=activities_list,
    )


def notify_user(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    task_id: int | None = None,
    link: str | None = None,
    notification_type: str = "task",
    event_id: str | None = None,
):
    try:
        from app.services.notification_service import create_notification
        user = db.query(User).filter(User.id == user_id).first()
        target_link = link
        if not target_link:
            if user and user.role in ("employee", "intern"):
                target_link = "/dashboard"
            else:
                target_link = f"/admin/tasks?task_id={task_id}" if task_id else "/admin/tasks"

        create_notification(
            db=db,
            user_id=user_id,
            title=title,
            message=message,
            notification_type=notification_type,
            task_id=task_id,
            link=target_link,
            event_id=event_id,
        )
    except Exception as exc:
        print(f"[tasks.notify_user] error: {exc}")


@router.get("/summary", response_model=TaskSummaryCounts)
def get_task_summary(
    my_tasks: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_query = scoped_tasks(db, current_user, my_tasks_only=my_tasks)
    today = date.today()

    total_tasks = base_query.count()
    in_progress = base_query.filter(Task.status == "In Progress").count()
    pending_review = base_query.filter(Task.status == "Submitted for Review").count()
    completed = base_query.filter(Task.status == "Completed").count()
    overdue_tasks = base_query.filter(
        Task.due_date.isnot(None),
        Task.due_date < today,
        Task.status != "Completed",
    ).count()

    return TaskSummaryCounts(
        total_tasks=total_tasks,
        in_progress=in_progress,
        pending_review=pending_review,
        completed=completed,
        overdue_tasks=overdue_tasks,
    )


def build_daily_update_dict(item: DailyWorkUpdate) -> dict[str, Any]:
    project_data = None
    if item.project:
        dept = item.project.department.value if hasattr(item.project.department, "value") else str(item.project.department or "")
        stat = item.project.status.value if hasattr(item.project.status, "value") else str(item.project.status or "")
        project_data = {
            "id": item.project.id,
            "name": item.project.name,
            "department": dept,
            "status": stat,
        }
    task_data = None
    if item.task:
        task_data = {
            "id": item.task.id,
            "title": item.task.title,
            "status": item.task.status,
            "priority": item.task.priority,
            "progress": item.task.progress or 0,
        }
    user_data = None
    if item.user:
        user_data = {
            "id": item.user.id,
            "full_name": item.user.full_name,
            "email": item.user.email,
            "role": item.user.role,
        }
    return {
        "id": item.id,
        "user_id": item.user_id,
        "project_id": item.project_id,
        "task_id": item.task_id,
        "update_date": item.update_date,
        "work_description": item.work_description,
        "work_status": item.work_status,
        "progress_percentage": item.progress_percentage,
        "blockers": item.blockers,
        "tomorrow_plan": item.tomorrow_plan,
        "attachment_url": item.attachment_url,
        "live_link": item.live_link,
        "remarks": item.remarks,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "user": user_data,
        "project": project_data,
        "task": task_data,
    }


@router.get("/daily-updates", response_model=list[DailyWorkUpdateResponse])
def get_daily_updates(
    project_id: int | None = Query(None),
    task_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        db.query(DailyWorkUpdate)
        .options(
            joinedload(DailyWorkUpdate.user),
            joinedload(DailyWorkUpdate.project),
            joinedload(DailyWorkUpdate.task),
        )
    )

    if current_user.role in ["employee", "intern"]:
        query = query.filter(DailyWorkUpdate.user_id == current_user.id)
    elif current_user.role == "manager":
        managed_proj_ids = [p.id for p in db.query(Project.id).filter(Project.manager_id == current_user.id).all()]
        query = query.filter(
            or_(
                DailyWorkUpdate.user_id == current_user.id,
                DailyWorkUpdate.project_id.in_(managed_proj_ids) if managed_proj_ids else False,
            )
        )

    if project_id:
        query = query.filter(DailyWorkUpdate.project_id == project_id)
    if task_id:
        query = query.filter(DailyWorkUpdate.task_id == task_id)

    updates = (
        query.order_by(DailyWorkUpdate.update_date.desc(), DailyWorkUpdate.id.desc())
        .limit(limit)
        .all()
    )
    return [build_daily_update_dict(u) for u in updates]


@router.post("/daily-updates", response_model=DailyWorkUpdateResponse, status_code=status.HTTP_201_CREATED)
def create_daily_update(
    payload: DailyWorkUpdateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    update_date = payload.update_date or date.today()
    target_task = None
    target_project_id = payload.project_id

    if payload.task_id:
        target_task = db.query(Task).filter(Task.id == payload.task_id).first()
        if not target_task:
            raise HTTPException(status_code=404, detail="Task not found.")

        if current_user.role in ["employee", "intern"]:
            is_assigned = db.query(TaskAssignment).filter(
                TaskAssignment.task_id == target_task.id,
                TaskAssignment.user_id == current_user.id,
            ).first()
            if not is_assigned and target_task.assigned_by_id != current_user.id:
                raise HTTPException(status_code=403, detail="You are not assigned to this task.")

        if target_task.project_id:
            target_project_id = target_task.project_id

        if payload.progress_percentage is not None:
            target_task.progress = payload.progress_percentage

        if payload.work_status in ["In Progress", "Submitted for Review", "Completed", "Changes Requested", "Assigned"]:
            target_task.status = payload.work_status

        target_task.updated_at = func.now()

        activity = TaskActivity(
            task_id=target_task.id,
            user_id=current_user.id,
            action="Daily Work Update",
            comment=f"{payload.work_status} ({payload.progress_percentage}%): {payload.work_description[:120]}",
        )
        db.add(activity)

        recipient_id = target_task.assigned_by_id
        if not recipient_id and target_task.project and target_task.project.manager_id:
            recipient_id = target_task.project.manager_id

        if recipient_id and recipient_id != current_user.id:
            notify_user(
                db=db,
                user_id=recipient_id,
                title=f"Daily Update on '{target_task.title}'",
                message=f"{current_user.full_name} logged daily update ({payload.work_status}, {payload.progress_percentage}%).",
                task_id=target_task.id,
            )

    new_update = DailyWorkUpdate(
        user_id=current_user.id,
        project_id=target_project_id,
        task_id=payload.task_id,
        update_date=update_date,
        work_description=payload.work_description.strip(),
        work_status=payload.work_status,
        progress_percentage=payload.progress_percentage,
        blockers=payload.blockers.strip() if payload.blockers else None,
        tomorrow_plan=payload.tomorrow_plan.strip() if payload.tomorrow_plan else None,
        attachment_url=payload.attachment_url,
        live_link=payload.live_link.strip() if payload.live_link else None,
        remarks=payload.remarks.strip() if payload.remarks else None,
    )
    db.add(new_update)
    db.commit()
    db.refresh(new_update)

    return build_daily_update_dict(new_update)


@router.get("", response_model=PageResponse[TaskResponse])
def list_tasks(
    q: str | None = Query(None),
    project_id: int | None = Query(None),
    user_id: int | None = Query(None),
    role: str | None = Query(None),
    priority: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    department: str | None = Query(None),
    standalone: bool | None = Query(None),
    due_date: date | None = Query(None),
    overdue: bool | None = Query(None),
    my_tasks: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    is_my_tasks = my_tasks is True
    query = scoped_tasks(db, current_user, my_tasks_only=is_my_tasks)

    if isinstance(q, str) and q.strip():
        term = q.strip()
        conditions = [Task.title.ilike(f"%{term}%")]
        if term.isdigit():
            conditions.append(Task.id == int(term))
        query = query.filter(or_(*conditions))

    if standalone is True or project_id == -1:
        query = query.filter(Task.project_id.is_(None))
    elif isinstance(project_id, int) and project_id > 0:
        query = query.filter(Task.project_id == project_id)

    if isinstance(department, str) and department.strip():
        query = query.filter(Task.project.has(Project.department == department.strip()))

    if isinstance(user_id, int):
        query = query.filter(Task.assignments.any(TaskAssignment.user_id == user_id))

    if isinstance(role, str) and role.strip():
        query = query.filter(
            Task.assignments.any(TaskAssignment.user.has(User.role == role.strip().lower()))
        )

    if isinstance(priority, str) and priority.strip():
        query = query.filter(Task.priority == priority.strip())

    if isinstance(status_filter, str) and status_filter.strip():
        query = query.filter(Task.status == status_filter.strip())

    if isinstance(due_date, date):
        query = query.filter(Task.due_date == due_date)

    if overdue is True:
        query = query.filter(
            Task.due_date.isnot(None),
            Task.due_date < date.today(),
            Task.status != "Completed",
        )

    cur_page = page if isinstance(page, int) and page >= 1 else 1
    cur_page_size = page_size if isinstance(page_size, int) and page_size >= 1 else 20

    total = query.count()
    offset = (cur_page - 1) * cur_page_size
    tasks = (
        query.options(
            joinedload(Task.project),
            joinedload(Task.assigned_by),
            joinedload(Task.assignments).joinedload(TaskAssignment.user),
            joinedload(Task.activities).joinedload(TaskActivity.user),
        )
        .order_by(Task.id.desc())
        .offset(offset)
        .limit(cur_page_size)
        .all()
    )

    items = [build_task_response(t, db) for t in tasks]
    return PageResponse(
        items=items,
        total=total,
        page=cur_page,
        page_size=cur_page_size,
    )


@router.get("/my-tasks", response_model=PageResponse[TaskResponse])
def get_my_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_tasks(
        q=None,
        project_id=None,
        user_id=None,
        role=None,
        priority=None,
        status_filter=None,
        due_date=None,
        overdue=None,
        my_tasks=True,
        page=page,
        page_size=page_size,
        db=db,
        current_user=current_user,
    )


@router.get("/assignable-users")
def get_assignable_users(
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied to list assignable users.",
        )

    users_query = db.query(User).filter(User.status == "active")

    existing_member_ids = set()
    if project_id:
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if not can_manage_project(project, current_user):
            raise HTTPException(status_code=403, detail="Not authorized to manage this project")

        existing_members = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project_id)
            .all()
        )
        existing_member_ids = {m.user_id for m in existing_members}
        if existing_member_ids:
            users_query = users_query.filter(User.id.in_(existing_member_ids))

    users = users_query.order_by(User.full_name).all()
    user_ids = [u.id for u in users]
    profiles = {}
    if user_ids:
        rows = db.query(StaffProfile).filter(StaffProfile.user_id.in_(user_ids)).all()
        profiles = {p.user_id: p for p in rows}

    result = []
    for u in users:
        prof = profiles.get(u.id)
        cat = None
        dept = None
        if prof:
            cat = prof.staff_category.value if hasattr(prof.staff_category, "value") else prof.staff_category
            dept = prof.department
        result.append({
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role,
            "staff_category": cat,
            "department": dept,
            "company_unit": dept,
            "is_project_team": True if project_id and u.id in existing_member_ids else False,
        })
    return result


@router.get("/project-members/{project_id}")
def get_project_assignable_members(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_assignable_users(project_id=project_id, db=db, current_user=current_user)


@router.get("/notifications")
def get_user_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.id.desc())
        .limit(30)
        .all()
    )
    return [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "task_id": n.task_id,
            "link": n.link,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in notifications
    ]


@router.post("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == current_user.id)
        .first()
    )
    if notif:
        notif.is_read = True
        db.commit()
    return {"status": "ok"}


@router.get("/{task_id}", response_model=TaskResponse)
def get_task_details(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id, current_user)
    return build_task_response(task, db)


@router.post("/personal", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_personal_task(
    payload: PersonalTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    clean_title = payload.title.strip()
    if not clean_title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Task title is required.",
        )

    if payload.planned_end < payload.planned_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Planned End date cannot be earlier than Planned Start date.",
        )

    task = Task(
        project_id=None,
        title=clean_title,
        description=payload.description.strip() if payload.description else None,
        status="Assigned",
        priority="Medium",
        assignment_type="Individual",
        assigned_by_id=current_user.id,
        start_date=payload.planned_start,
        due_date=payload.planned_end,
        progress=0,
    )
    db.add(task)
    db.flush()

    # Automatically associate the task with the currently authenticated user in database
    db.add(TaskAssignment(task_id=task.id, user_id=current_user.id))

    activity = TaskActivity(
        task_id=task.id,
        user_id=current_user.id,
        action="created",
        comment="Logged personal daily task.",
    )
    db.add(activity)

    db.commit()
    db.refresh(task)

    return build_task_response(task, db)


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and managers can create tasks.",
        )

    clean_title = payload.title.strip()
    if not clean_title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Task title is required.",
        )

    if payload.start_date and payload.due_date and payload.due_date < payload.start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Planned End cannot be earlier than Planned Start.",
        )

    project = None
    if payload.project_id is not None:
        project = db.query(Project).filter(Project.id == payload.project_id).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

        if not can_manage_project(project, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to create tasks for this project.",
            )
    elif current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project is required to create and assign tasks.",
        )

    # Validate assignees if provided
    assignee_users: list[User] = []
    if payload.assignee_ids:
        unique_assignee_ids = list(dict.fromkeys(payload.assignee_ids))
        assignee_users = db.query(User).filter(
            User.id.in_(unique_assignee_ids),
            User.status == "active",
        ).all()
        if len(assignee_users) != len(unique_assignee_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more specified assignees do not exist or are inactive.",
            )

    if project is not None:
        existing_project_members = (
            db.query(ProjectMember)
            .filter(ProjectMember.project_id == project.id)
            .all()
        )
        existing_member_ids = {m.user_id for m in existing_project_members}

        if existing_member_ids:
            # Project already has a saved team:
            # Validate that assignees belong to that saved team!
            for user in assignee_users:
                if user.id not in existing_member_ids:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"User '{user.full_name}' is not a member of project '{project.name}' team.",
                    )
        else:
            # Initial project team assignment:
            # Persist selected assignees as the project's saved team in database without duplicates
            for user in assignee_users:
                if user.id not in existing_member_ids:
                    db.add(ProjectMember(project_id=project.id, user_id=user.id))
                    existing_member_ids.add(user.id)
            try:
                db.flush()
            except Exception:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Error persisting project team membership. Please retry.",
                )

    task = Task(
        project_id=payload.project_id,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        status="Assigned",
        priority=payload.priority,
        assignment_type=payload.assignment_type,
        assigned_by_id=current_user.id,
        start_date=payload.start_date,
        due_date=payload.due_date,
        estimated_hours=payload.estimated_hours,
        progress=0,
    )
    db.add(task)
    db.flush()

    for user in assignee_users:
        db.add(TaskAssignment(task_id=task.id, user_id=user.id))
        notify_user(
            db=db,
            user_id=user.id,
            title="New Task Assignment",
            message=f"You have been assigned to task '{task.title}' by {current_user.full_name}.",
            task_id=task.id,
        )

    # Log activity
    assignee_names = ", ".join(u.full_name for u in assignee_users) if assignee_users else "None"
    activity = TaskActivity(
        task_id=task.id,
        user_id=current_user.id,
        action="created",
        comment=f"Created task with priority {task.priority}. Assigned to: {assignee_names}",
    )
    db.add(activity)
    db.commit()
    db.refresh(task)

    return build_task_response(task, db)


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id, current_user)

    if not can_edit_task(task, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit this task.",
        )

    # Date cross-check between payload and existing task dates
    eff_start = payload.start_date if payload.start_date is not None else task.start_date
    eff_due = payload.due_date if payload.due_date is not None else task.due_date
    if eff_start and eff_due and eff_due < eff_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Due date cannot be earlier than start date.",
        )

    if payload.project_id is not None and payload.project_id != task.project_id:
        target_project = db.query(Project).filter(Project.id == payload.project_id).first()
        if not target_project or not can_manage_project(target_project, current_user):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid target project or unauthorized.",
            )
        task.project_id = payload.project_id

    changes = []
    if payload.title is not None and payload.title.strip() != task.title:
        changes.append(f"title changed to '{payload.title.strip()}'")
        task.title = payload.title.strip()

    if payload.description is not None:
        task.description = payload.description.strip() if payload.description else None

    if payload.priority is not None and payload.priority != task.priority:
        changes.append(f"priority changed to {payload.priority}")
        task.priority = payload.priority

    if payload.start_date is not None:
        task.start_date = payload.start_date

    if payload.due_date is not None:
        task.due_date = payload.due_date

    if payload.estimated_hours is not None:
        task.estimated_hours = payload.estimated_hours

    if payload.progress is not None and payload.progress != task.progress:
        changes.append(f"progress updated to {payload.progress}%")
        task.progress = payload.progress

    if payload.status is not None and payload.status != task.status:
        changes.append(f"status changed to {payload.status}")
        task.status = payload.status


    if payload.assignee_ids is not None:
        unique_assignee_ids = list(dict.fromkeys(payload.assignee_ids))
        users = db.query(User).filter(
            User.id.in_(unique_assignee_ids),
            User.status == "active",
        ).all()
        if len(users) != len(unique_assignee_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="One or more specified users are invalid or inactive.",
            )

        target_proj_id = payload.project_id if payload.project_id is not None else task.project_id
        if target_proj_id:
            existing_members = (
                db.query(ProjectMember)
                .filter(ProjectMember.project_id == target_proj_id)
                .all()
            )
            existing_member_ids = {m.user_id for m in existing_members}
            if existing_member_ids:
                for u in users:
                    if u.id not in existing_member_ids:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"User '{u.full_name}' is not a member of the project team.",
                        )

        existing_ids = {a.user_id for a in task.assignments}
        new_ids = set(unique_assignee_ids)

        if existing_ids != new_ids:
            for assignment in list(task.assignments):
                if assignment.user_id not in new_ids:
                    db.delete(assignment)

            for u in users:
                if u.id not in existing_ids:
                    db.add(TaskAssignment(task_id=task.id, user_id=u.id))
                    notify_user(
                        db=db,
                        user_id=u.id,
                        title="Task Assigned to You",
                        message=f"You have been assigned to task '{task.title}' by {current_user.full_name}.",
                        task_id=task.id,
                    )

            task.assignment_type = "Group" if len(payload.assignee_ids) > 1 else "Individual"
            changes.append(f"assignees updated ({len(users)} member(s))")

    task.updated_at = func.now()

    if changes:
        activity = TaskActivity(
            task_id=task.id,
            user_id=current_user.id,
            action="updated",
            comment="; ".join(changes),
        )
        db.add(activity)

    db.commit()
    db.refresh(task)
    return build_task_response(task, db)


@router.post("/{task_id}/assign", response_model=TaskResponse)
def assign_task(
    task_id: int,
    payload: TaskAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id, current_user)

    if current_user.role not in ("admin", "manager") and not can_manage_project(task.project, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied to assign tasks.",
        )


    users = db.query(User).filter(
        User.id.in_(payload.assignee_ids),
        User.status == "active",
    ).all()
    if len(users) != len(set(payload.assignee_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more specified users are invalid or inactive.",
        )

    existing_ids = {a.user_id for a in task.assignments}
    new_ids = set(payload.assignee_ids)

    # Delete removed
    for assignment in list(task.assignments):
        if assignment.user_id not in new_ids:
            db.delete(assignment)

    # Add new
    added_users = []
    for u in users:
        if u.id not in existing_ids:
            db.add(TaskAssignment(task_id=task.id, user_id=u.id))
            added_users.append(u)
            notify_user(
                db=db,
                user_id=u.id,
                title="Task Assigned to You",
                message=f"You have been assigned to task '{task.title}' by {current_user.full_name}.",
                task_id=task.id,
            )

    task.assignment_type = payload.assignment_type
    task.assigned_by_id = current_user.id
    task.updated_at = func.now()

    all_names = ", ".join(u.full_name for u in users)
    activity = TaskActivity(
        task_id=task.id,
        user_id=current_user.id,
        action="assigned",
        comment=f"Assigned to {len(users)} member(s) ({payload.assignment_type}): {all_names}",
    )
    db.add(activity)

    db.commit()
    db.refresh(task)
    return build_task_response(task, db)


@router.patch("/{task_id}/progress", response_model=TaskResponse)
def update_task_progress(
    task_id: int,
    payload: TaskProgressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id, current_user)

    is_assignee = any(a.user_id == current_user.id for a in task.assignments)
    is_manager_or_admin = can_manage_project(task.project, current_user)

    if not is_assignee and not is_manager_or_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to update progress on this task.",
        )

    if task.status == "Completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completed tasks cannot be updated.",
        )

    if task.status == "Submitted for Review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task is currently submitted for review. Wait for review feedback before updating progress.",
        )

    # Prevent direct jump to Completed
    if payload.status == "Completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Completed status requires review submission and authorized approval.",
        )

    old_progress = task.progress
    old_status = task.status
    task.progress = payload.progress

    # Workflow transition logic:
    # Assigned -> In Progress (when progress starts)
    # Changes Requested -> In Progress (when rework begins)
    if task.status in ("Assigned", "Changes Requested") and (payload.progress > 0 or payload.status == "In Progress"):
        task.status = "In Progress"
    elif payload.status in ("Assigned", "In Progress"):
        task.status = payload.status

    task.updated_at = func.now()

    comment_parts = [f"Progress updated from {old_progress}% to {task.progress}%"]
    if task.status != old_status:
        comment_parts.append(f"status moved from '{old_status}' to '{task.status}'")
        from app.services.notification_service import notify_task_status_changed
        notify_task_status_changed(db, task, current_user, old_status, task.status)
    if payload.comment:
        comment_parts.append(f"Note: {payload.comment.strip()}")

    activity = TaskActivity(
        task_id=task.id,
        user_id=current_user.id,
        action="progress_updated",
        comment="; ".join(comment_parts),
    )
    db.add(activity)

    db.commit()
    db.refresh(task)
    return build_task_response(task, db)


@router.post("/{task_id}/submit-review", response_model=TaskResponse)
def submit_task_for_review(
    task_id: int,
    payload: TaskSubmitReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id, current_user)

    is_assignee = any(a.user_id == current_user.id for a in task.assignments)
    is_manager_or_admin = can_manage_project(task.project, current_user)

    if not is_assignee and not is_manager_or_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not assigned to this task.",
        )

    if task.status == "Completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task is already marked Completed.",
        )

    if task.status == "Submitted for Review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task is already submitted for review.",
        )

    # Valid transitions: Assigned / In Progress / Changes Requested -> Submitted for Review
    task.status = "Submitted for Review"
    task.submission_notes = payload.submission_notes.strip() if payload.submission_notes else None
    task.updated_at = func.now()

    note = f"Submission notes: {task.submission_notes}" if task.submission_notes else "Submitted for approval."
    activity = TaskActivity(
        task_id=task.id,
        user_id=current_user.id,
        action="submitted_for_review",
        comment=note,
    )
    db.add(activity)

    # Notify assigned_by or project manager
    reviewer_id = task.assigned_by_id or task.project.manager_id
    if reviewer_id and reviewer_id != current_user.id:
        notify_user(
            db=db,
            user_id=reviewer_id,
            title="Task Submitted for Review",
            message=f"{current_user.full_name} submitted task '{task.title}' for review.",
            task_id=task.id,
        )

    db.commit()
    db.refresh(task)
    return build_task_response(task, db)


@router.post("/{task_id}/review", response_model=TaskResponse)
def review_task(
    task_id: int,
    payload: TaskReviewAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id, current_user)

    if not can_manage_project(task.project, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and authorized managers can review tasks.",
        )

    if task.status != "Submitted for Review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot review task in '{task.status}' status. Task must be 'Submitted for Review'.",
        )

    comment = payload.comment.strip() if payload.comment else ""

    if payload.action == "approve":
        task.status = "Completed"
        task.progress = 100
        task.review_comments = comment or "Approved by reviewer."
        action_name = "approved"
        notif_title = "Task Approved!"
        notif_msg = f"Task '{task.title}' has been approved and marked Completed by {current_user.full_name}."
    elif payload.action == "request_changes":
        task.status = "Changes Requested"
        task.review_comments = comment or "Changes requested by reviewer."
        action_name = "changes_requested"
        notif_title = "Changes Requested on Task"
        notif_msg = f"Changes requested for task '{task.title}' by {current_user.full_name}: {comment}"
    else:
        raise HTTPException(status_code=400, detail="Invalid review action.")

    task.updated_at = func.now()

    activity = TaskActivity(
        task_id=task.id,
        user_id=current_user.id,
        action=action_name,
        comment=f"Action: {action_name}. Comment: {comment or 'None'}",
    )
    db.add(activity)

    # Notify all assignees
    for assignment in task.assignments:
        notify_user(
            db=db,
            user_id=assignment.user_id,
            title=notif_title,
            message=notif_msg,
            task_id=task.id,
        )

    db.commit()
    db.refresh(task)
    return build_task_response(task, db)


@router.patch("/{task_id}", response_model=TaskResponse)
def patch_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return update_task(task_id, payload, db, current_user)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id, current_user)
    if not can_delete_task(task, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied to delete task.",
        )

    db.delete(task)
    db.commit()
    return None

