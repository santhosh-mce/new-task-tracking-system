from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies.auth import get_db
from app.dependencies.permissions import require_project_reader
from app.models.project import Project
from app.models.staff_profile import StaffCategory, StaffProfile
from app.models.user import User
from app.routers.projects import scoped_projects
from app.routers.users import authorized_staff_ids

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/overview")
def dashboard_overview(
    db: Session = Depends(get_db),
    user: User = Depends(require_project_reader),
):
    project_count = scoped_projects(db, user).count()
    staff_ids = authorized_staff_ids(db, user)
    counts_query = db.query(
        StaffProfile.staff_category,
        func.count(StaffProfile.id),
    ).join(User, User.id == StaffProfile.user_id)
    if staff_ids is not None:
        if not staff_ids:
            counts_query = counts_query.filter(False)
        else:
            counts_query = counts_query.filter(User.id.in_(staff_ids))

    category_counts = {
        category: count
        for category, count in counts_query.group_by(StaffProfile.staff_category).all()
    }

    active_counts_query = (
        db.query(
            StaffProfile.staff_category,
            func.count(StaffProfile.id),
        )
        .join(User, User.id == StaffProfile.user_id)
        .filter(User.status == "active")
    )
    if staff_ids is not None:
        if not staff_ids:
            active_counts_query = active_counts_query.filter(False)
        else:
            active_counts_query = active_counts_query.filter(User.id.in_(staff_ids))

    active_category_counts = {
        category: count
        for category, count in active_counts_query.group_by(StaffProfile.staff_category).all()
    }

    return {
        "total_projects": project_count,
        "employees": category_counts.get(StaffCategory.EMPLOYEE, 0),
        "employees_active": active_category_counts.get(StaffCategory.EMPLOYEE, 0),
        "interns": category_counts.get(StaffCategory.INTERN, 0),
        "interns_active": active_category_counts.get(StaffCategory.INTERN, 0),
    }
