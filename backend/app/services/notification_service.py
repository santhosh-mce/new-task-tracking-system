from datetime import date, datetime, timedelta, timezone
import time
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.task import Notification, Task, TaskAssignment, DailyWorkUpdate
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.attendance import AttendanceCorrection


def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    notification_type: str = "general",
    task_id: Optional[int] = None,
    link: Optional[str] = None,
    event_id: Optional[str] = None,
) -> Optional[Notification]:
    """
    Creates a notification for user_id with duplicate prevention via event_id.
    """
    try:
        if event_id:
            existing = (
                db.query(Notification)
                .filter(Notification.user_id == user_id, Notification.event_id == event_id)
                .first()
            )
            if existing:
                return existing

        notif = Notification(
            user_id=user_id,
            title=title.strip()[:200],
            message=message.strip(),
            notification_type=notification_type[:50],
            task_id=task_id,
            link=link[:255] if link else None,
            event_id=event_id[:100] if event_id else None,
            is_read=False,
        )
        db.add(notif)
        db.flush()
        return notif
    except Exception as exc:
        print(f"[notification_service] Error creating notification: {exc}")
        return None


def notify_project_assignment(
    db: Session,
    project_id: int,
    project_name: str,
    user_ids: List[int],
    assigner: User,
) -> None:
    for uid in set(user_ids):
        if uid == assigner.id:
            continue
        user = db.query(User).filter(User.id == uid).first()
        if not user:
            continue

        target_link = "/dashboard" if user.role in ("employee", "intern") else f"/admin/projects/{project_id}"
        create_notification(
            db=db,
            user_id=uid,
            title=f"Project Assigned: {project_name}",
            message=f"You have been assigned to project \"{project_name}\" by {assigner.full_name or 'Management'}.",
            notification_type="project",
            link=target_link,
            event_id=f"proj_assign_{project_id}_{uid}",
        )


def notify_task_assignment(
    db: Session,
    task: Task,
    user_ids: List[int],
    assigner: User,
    is_reassignment: bool = False,
) -> None:
    today_str = date.today().isoformat()
    action = "reassigned" if is_reassignment else "assigned"
    title = f"Task {'Reassigned' if is_reassignment else 'Assigned'}: {task.title}"

    for uid in set(user_ids):
        if uid == assigner.id:
            continue
        user = db.query(User).filter(User.id == uid).first()
        if not user:
            continue

        due_info = f" Due: {task.due_date}." if task.due_date else ""
        message = f"Task \"{task.title}\" has been {action} to you by {assigner.full_name or 'Management'}.{due_info}"
        target_link = "/dashboard" if user.role in ("employee", "intern") else "/admin/tasks/my-tasks"

        create_notification(
            db=db,
            user_id=uid,
            title=title,
            message=message,
            notification_type="task",
            task_id=task.id,
            link=target_link,
            event_id=f"task_assign_{task.id}_{uid}_{today_str}_{action}",
        )


def notify_task_status_changed(
    db: Session,
    task: Task,
    updated_by_user: User,
    old_status: str,
    new_status: str,
) -> None:
    if old_status == new_status:
        return

    recipients = set()
    if task.assigned_by_id and task.assigned_by_id != updated_by_user.id:
        recipients.add(task.assigned_by_id)

    if task.project_id:
        proj = db.query(Project).filter(Project.id == task.project_id).first()
        if proj and proj.manager_id and proj.manager_id != updated_by_user.id:
            recipients.add(proj.manager_id)

    # Event key buckets by 5-minute interval
    time_bucket = int(time.time() // 300)
    for uid in recipients:
        u = db.query(User).filter(User.id == uid).first()
        link = "/admin/tasks/assign" if u and u.role in ("admin", "manager") else "/dashboard"
        create_notification(
            db=db,
            user_id=uid,
            title=f"Task Status Updated: {task.title}",
            message=f"{updated_by_user.full_name or 'A team member'} updated \"{task.title}\" from {old_status} to {new_status}.",
            notification_type="task_status",
            task_id=task.id,
            link=link,
            event_id=f"task_stat_{task.id}_{new_status}_{time_bucket}",
        )


def notify_task_review_submitted(
    db: Session,
    task: Task,
    submitted_by_user: User,
) -> None:
    recipients = set()
    if task.assigned_by_id and task.assigned_by_id != submitted_by_user.id:
        recipients.add(task.assigned_by_id)

    if task.project_id:
        proj = db.query(Project).filter(Project.id == task.project_id).first()
        if proj and proj.manager_id and proj.manager_id != submitted_by_user.id:
            recipients.add(proj.manager_id)

    # Also notify admins if no specific manager
    if not recipients:
        admins = db.query(User.id).filter(User.role == "admin", User.status == "active").all()
        for a in admins:
            if a[0] != submitted_by_user.id:
                recipients.add(a[0])

    time_bucket = int(time.time() // 300)
    for uid in recipients:
        u = db.query(User).filter(User.id == uid).first()
        link = "/admin/tasks/assign" if u and u.role in ("admin", "manager") else "/dashboard"
        create_notification(
            db=db,
            user_id=uid,
            title=f"Review Requested: {task.title}",
            message=f"{submitted_by_user.full_name or 'A staff member'} submitted deliverables for \"{task.title}\" and requested review.",
            notification_type="review",
            task_id=task.id,
            link=link,
            event_id=f"task_rev_sub_{task.id}_{time_bucket}",
        )


def notify_task_review_decision(
    db: Session,
    task: Task,
    reviewer: User,
    approved: bool = True,
    feedback: str = "",
) -> None:
    # Notify assignees
    assignee_ids = [
        ta.user_id
        for ta in db.query(TaskAssignment).filter(TaskAssignment.task_id == task.id).all()
        if ta.user_id != reviewer.id
    ]

    action_text = "Approved" if approved else "Returned for Changes"
    notif_type = "review_approved" if approved else "review_changes"
    time_bucket = int(time.time() // 300)

    for uid in assignee_ids:
        u = db.query(User).filter(User.id == uid).first()
        link = "/dashboard" if u and u.role in ("employee", "intern") else "/admin/tasks/my-tasks"
        fb_msg = f" Feedback: \"{feedback}\"" if feedback else ""
        create_notification(
            db=db,
            user_id=uid,
            title=f"Task Deliverable {action_text}",
            message=f"{reviewer.full_name or 'Manager'} has {action_text.lower()} your deliverable for \"{task.title}\".{fb_msg}",
            notification_type=notif_type,
            task_id=task.id,
            link=link,
            event_id=f"task_rev_dec_{task.id}_{uid}_{action_text}_{time_bucket}",
        )


def notify_attendance_correction(
    db: Session,
    correction: AttendanceCorrection,
    user: User,
) -> None:
    admins = db.query(User).filter(User.role.in_(("admin", "manager")), User.status == "active").all()
    req_date = getattr(correction, "request_date", None) or getattr(correction, "date", "")
    for adm in admins:
        if adm.id == user.id:
            continue
        create_notification(
            db=db,
            user_id=adm.id,
            title="Attendance Correction Request",
            message=f"{user.full_name or 'Staff'} requested an attendance correction for {req_date}. Reason: {correction.reason or 'None'}.",
            notification_type="attendance",
            link="/admin/attendance",
            event_id=f"att_corr_sub_{correction.id}_{adm.id}",
        )


def notify_attendance_correction_decision(
    db: Session,
    correction: AttendanceCorrection,
    reviewer: User,
) -> None:
    req_date = getattr(correction, "request_date", None) or getattr(correction, "date", "")
    remarks = getattr(correction, "reviewer_remarks", None) or getattr(correction, "reviewer_notes", "")
    remarks_str = f" Notes: {remarks}" if remarks else ""
    create_notification(
        db=db,
        user_id=correction.user_id,
        title=f"Attendance Correction {correction.status}",
        message=f"Your attendance correction for {req_date} was {correction.status.lower()} by {reviewer.full_name or 'Admin'}.{remarks_str}",
        notification_type="attendance",
        link="/attendance",
        event_id=f"att_corr_dec_{correction.id}_{correction.status}",
    )


def notify_daily_work_update(
    db: Session,
    update: DailyWorkUpdate,
    user: User,
) -> None:
    recipients = set()
    if update.project_id:
        proj = db.query(Project).filter(Project.id == update.project_id).first()
        if proj and proj.manager_id and proj.manager_id != user.id:
            recipients.add(proj.manager_id)

    if not recipients:
        admins = db.query(User.id).filter(User.role == "admin", User.status == "active").all()
        for a in admins:
            if a[0] != user.id:
                recipients.add(a[0])

    for uid in recipients:
        create_notification(
            db=db,
            user_id=uid,
            title="Daily Work Update Logged",
            message=f"{user.full_name} logged a daily work update for {update.work_date} ({update.hours_spent} hrs).",
            notification_type="work_update",
            task_id=update.task_id,
            link="/admin/tasks/assign",
            event_id=f"dwu_{update.id}_{uid}",
        )


def check_and_notify_task_deadlines(db: Session, user: User) -> None:
    """
    Checks active tasks assigned to user and generates deadline alerts if approaching or overdue.
    Uses daily event IDs to prevent duplicate alerts on the same date.
    """
    today = date.today()
    tomorrow = today + timedelta(days=1)
    today_str = today.isoformat()

    assigned_task_ids = [
        ta.task_id
        for ta in db.query(TaskAssignment.task_id).filter(TaskAssignment.user_id == user.id).all()
    ]
    if not assigned_task_ids:
        return

    active_tasks = (
        db.query(Task)
        .filter(
            Task.id.in_(assigned_task_ids),
            Task.status != "Completed",
            Task.due_date.isnot(None),
        )
        .all()
    )

    for task in active_tasks:
        target_link = "/dashboard" if user.role in ("employee", "intern") else "/admin/tasks/my-tasks"
        if task.due_date < today:
            # Overdue
            create_notification(
                db=db,
                user_id=user.id,
                title=f"Task Overdue: {task.title}",
                message=f"Task \"{task.title}\" was due on {task.due_date}. Please update its status or submit your work.",
                notification_type="deadline_overdue",
                task_id=task.id,
                link=target_link,
                event_id=f"overdue_{task.id}_{user.id}_{today_str}",
            )
        elif task.due_date == today:
            # Due today
            create_notification(
                db=db,
                user_id=user.id,
                title=f"Task Due Today: {task.title}",
                message=f"Task \"{task.title}\" is due today ({task.due_date}).",
                notification_type="deadline_today",
                task_id=task.id,
                link=target_link,
                event_id=f"due_today_{task.id}_{user.id}_{today_str}",
            )
        elif task.due_date == tomorrow:
            # Due tomorrow
            create_notification(
                db=db,
                user_id=user.id,
                title=f"Deadline Approaching: {task.title}",
                message=f"Task \"{task.title}\" is due tomorrow ({task.due_date}).",
                notification_type="deadline_upcoming",
                task_id=task.id,
                link=target_link,
                event_id=f"due_tomorrow_{task.id}_{user.id}_{today_str}",
            )
