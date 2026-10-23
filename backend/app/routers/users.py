from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user, get_db
from app.dependencies.permissions import require_admin, require_project_reader
from app.models.invitation import UserInvitation
from app.models.project import Project
from app.models.staff_profile import StaffCategory, StaffProfile
from app.models.task import Task, TaskAssignment
from app.models.user import User
from app.schemas.pagination import PageResponse
from app.schemas.invitations import (
    AdminInvitationCreate,
    AdminInvitationResponse,
    InvitationStatus,
    UserInvitationCreate,
)
from app.schemas.projects import (
    AssignedProjectSummary,
    EducationDetails,
    ProjectManagerSummary,
    StaffListItem,
    StaffProfileDetails,
)
from app.schemas.users import (
    AdminUserProfileUpdate,
    UserProfileComplete,
    UserResponse,
    UserRoleUpdate,
    UserStatusUpdate,
)
from app.services.invitation_email import (
    InvitationEmailError,
    ensure_utc,
    generate_invitation_token,
    hash_invitation_token,
    send_invitation_email,
    utc_now,
)

router = APIRouter(prefix="/api/users", tags=["Users"])


def authorized_staff_ids(db: Session, user: User) -> set[int] | None:
    if user.role == "admin":
        return None
    if user.role != "manager":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    return None


def invitation_status_for(
    user: User,
    invitation: UserInvitation | None,
    now: datetime | None = None,
) -> str | None:
    if invitation and invitation.completed_at:
        return "Registration Completed"
    if user.status not in ("invitation_pending", "inactive"):
        return None
    if (
        invitation is None
        or invitation.sent_at is None
        or invitation.expires_at is None
        or invitation.revoked_at is not None
    ):
        return "Not sent"
    current_time = ensure_utc(now or utc_now())
    return (
        "Expired"
        if ensure_utc(invitation.expires_at) <= current_time
        else "Invitation Pending"
    )


def staff_list_item(
    user: User,
    profile: StaffProfile | None,
    invitation: UserInvitation | None = None,
) -> dict:
    return {
        "id": user.id,
        "full_name": user.full_name or None,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "staff_category": profile.staff_category if profile else None,
        "staff_id": (profile.staff_id if profile else None) or (profile.employee_id if profile else None) or (profile.intern_id if profile else None),
        "employee_id": profile.employee_id if profile else None,
        "intern_id": profile.intern_id if profile else None,
        "mobile": profile.mobile if profile else None,
        "department": profile.department if profile else None,
        "profile_status": getattr(user, "profile_status", "complete") or "complete",
        "invitation_status": invitation_status_for(user, invitation),
        "invitation_sent_at": invitation.sent_at if invitation else None,
        "registration_completed_at": (
            invitation.completed_at if invitation else None
        ),
        "can_manage_status": user.status == "active"
        or (user.status == "inactive" and user.password_hash is not None),
        "can_resend_invitation": (
            user.status in ("invitation_pending", "inactive")
            and user.password_hash is None
            and (invitation is None or invitation.completed_at is None)
            and (
                user.role in ("admin", "manager", "employee", "intern")
                or profile is not None
                and profile.staff_category in (
                    StaffCategory.EMPLOYEE,
                    StaffCategory.INTERN,
                )
            )
        ),
    }


def apply_invitation_filters(query, invitation_status: InvitationStatus, now):
    if invitation_status == "Registration Completed":
        return query.filter(UserInvitation.completed_at.isnot(None))
    if invitation_status == "Not sent":
        return query.filter(
            User.status.in_(("invitation_pending", "inactive")),
            User.password_hash.is_(None),
            or_(
                UserInvitation.id.is_(None),
                UserInvitation.sent_at.is_(None),
                UserInvitation.revoked_at.isnot(None),
            ),
        )
    base = (
        User.status == "invitation_pending",
        UserInvitation.completed_at.is_(None),
        UserInvitation.sent_at.isnot(None),
        UserInvitation.expires_at.isnot(None),
        UserInvitation.revoked_at.is_(None),
    )
    query = query.filter(*base)
    return query.filter(
        UserInvitation.expires_at > now
        if invitation_status == "Invitation Pending"
        else UserInvitation.expires_at <= now
    )


def record_invitation_attempt(invitation: UserInvitation, now: datetime) -> None:
    last_attempt = invitation.last_attempt_at
    if last_attempt and now - ensure_utc(last_attempt) < timedelta(seconds=30):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting another invitation email.",
        )

    window_started = invitation.attempt_window_started_at
    if (
        window_started is None
        or now - ensure_utc(window_started) >= timedelta(hours=1)
    ):
        invitation.attempt_window_started_at = now
        invitation.window_attempt_count = 0
    if (invitation.window_attempt_count or 0) >= 5:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Invitation resend limit reached. Try again later.",
        )
    invitation.window_attempt_count += 1
    invitation.last_attempt_at = now


def deliver_invitation(
    db: Session,
    user: User,
    invitation: UserInvitation,
    token: str,
    issued_at: datetime,
) -> dict:
    invitation.token_hash = hash_invitation_token(token)
    invitation.sent_at = issued_at
    invitation.expires_at = issued_at + timedelta(minutes=5)
    invitation.completed_at = None
    invitation.revoked_at = None
    db.commit()
    db.refresh(user)
    db.refresh(invitation)

    try:
        send_invitation_email(
            email=user.email,
            role=invitation.role,
            token=token,
            expires_at=invitation.expires_at,
        )
    except InvitationEmailError as exc:
        invitation.revoked_at = utc_now()
        invitation.sent_at = None
        invitation.expires_at = None
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "The account was saved, but the invitation email could not be sent. "
                f"{exc} Use Resend Invite to retry after correcting the issue."
            ),
        ) from exc

    return staff_list_item(user, None, invitation)


@router.get(
    "",
    response_model=PageResponse[StaffListItem],
)
def list_users(
    role: str | None = Query(
        default=None,
        pattern="^(admin|manager|team_lead|employee|intern|user)$",
    ),
    category: StaffCategory | None = None,
    q: str | None = Query(default=None, max_length=200),
    account_status: str | None = Query(
        default=None,
        alias="status",
        pattern="^(active|inactive|invitation_pending)$",
    ),
    invitation_status: InvitationStatus | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    allowed_ids = authorized_staff_ids(db, current_user)
    query = (
        db.query(User, StaffProfile, UserInvitation)
        .outerjoin(StaffProfile, StaffProfile.user_id == User.id)
        .outerjoin(UserInvitation, UserInvitation.user_id == User.id)
    )
    if allowed_ids is not None:
        if not allowed_ids:
            query = query.filter(False)
        else:
            query = query.filter(User.id.in_(allowed_ids))
    if role:
        query = query.filter(User.role == role)
    if category:
        query = query.filter(StaffProfile.staff_category == category)
    if account_status:
        query = query.filter(User.status == account_status)
    if q:
        query = query.filter(
            (User.full_name.ilike(f"%{q.strip()}%"))
            | (User.email.ilike(f"%{q.strip()}%"))
        )
    if invitation_status:
        query = apply_invitation_filters(query, invitation_status, utc_now())

    total = query.count()
    rows = (
        query.order_by(User.full_name, User.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [
            staff_list_item(user, profile, invitation)
            for user, profile, invitation in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post(
    "/invitations",
    response_model=AdminInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user_invitation(
    data: AdminInvitationCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    from app.routers.admin_invitations import create_invitation
    return create_invitation(data, db, admin)


@router.post(
    "/{user_id}/resend-invitation",
    response_model=StaffListItem,
)
def resend_user_invitation(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = (
        db.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    invitation = (
        db.query(UserInvitation)
        .filter(UserInvitation.user_id == user.id)
        .with_for_update()
        .first()
    )
    if user.password_hash or (invitation and invitation.completed_at):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration has already been completed for this account.",
        )

    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    role = user.role
    if role not in ("admin", "manager", "employee", "intern"):
        role = {
            StaffCategory.EMPLOYEE: "employee",
            StaffCategory.INTERN: "intern",
        }.get(profile.staff_category if profile else None, "")
    if not role:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This account does not have a supported invitation role.",
        )
    if user.status not in ("invitation_pending", "inactive"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only accounts awaiting registration can receive an invitation.",
        )
    if invitation is None:
        invitation = UserInvitation(user_id=user.id, role=role)
        db.add(invitation)
        db.flush()

    now = utc_now()
    record_invitation_attempt(invitation, now)
    invitation.role = role
    user.role = role
    user.status = "invitation_pending"

    token = generate_invitation_token()
    result = deliver_invitation(db, user, invitation, token, now)
    result["department"] = profile.department if profile else None
    result["staff_category"] = profile.staff_category if profile else None
    return result


@router.get("/profile/me")
def get_my_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name or "",
        "role": user.role,
        "status": user.status,
        "must_change_password": bool(getattr(user, "must_change_password", False)),
        "onboarding_status": getattr(user, "onboarding_status", "completed"),
        "profile_status": getattr(user, "profile_status", "incomplete"),
        "staff_category": profile.staff_category.value if profile and hasattr(profile.staff_category, "value") else (profile.staff_category if profile else None),
        "staff_id": profile.staff_id if profile else None,
        "employee_id": profile.employee_id if profile else None,
        "intern_id": profile.intern_id if profile else None,
        "mobile": profile.mobile if profile else None,
        "profile_photo": profile.profile_photo if profile else None,
        "dob": profile.dob.isoformat() if profile and profile.dob else None,
        "gender": profile.gender if profile else None,
        "address": profile.address if profile else None,
        "city": profile.city if profile else None,
        "highest_qualification": profile.highest_qualification if profile else None,
        "institution": profile.institution if profile else None,
        "degree": profile.degree if profile else None,
        "graduation_year": profile.graduation_year if profile else None,
        "skills": profile.skills if profile and isinstance(profile.skills, list) else [],
        "resume_url": profile.resume_url if profile else None,
        "department": profile.department if profile else None,
        "designation": getattr(profile, "designation", None) if profile else None,
        "joining_date": profile.joining_date.isoformat() if profile and profile.joining_date else None,
        "reporting_manager_id": profile.reporting_manager_id if profile else None,
        "work_location": profile.work_location if profile else None,
    }


@router.post("/profile/complete")
def complete_my_profile(
    data: UserProfileComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if getattr(user, "must_change_password", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must change your temporary password before completing your profile.",
        )

    user.full_name = data.full_name.strip()
    user.profile_status = "complete"
    user.onboarding_status = "completed"

    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    if not profile:
        prefix = {"employee": "EMP", "intern": "INT", "manager": "MGR"}.get(user.role, "STF")
        staff_id = f"{prefix}-{user.id:04d}"
        profile = StaffProfile(
            user_id=user.id,
            staff_category={
                "employee": StaffCategory.EMPLOYEE,
                "intern": StaffCategory.INTERN,
                "manager": StaffCategory.MANAGER,
            }.get(user.role),
            staff_id=staff_id,
            employee_id=staff_id if user.role == "employee" else None,
            intern_id=staff_id if user.role == "intern" else None,
        )
        db.add(profile)
        db.flush()

    profile.mobile = data.mobile.strip() if data.mobile else None
    profile.profile_photo = data.profile_photo
    profile.gender = data.gender
    profile.address = data.address
    profile.city = data.city
    profile.highest_qualification = data.highest_qualification
    profile.institution = data.institution
    profile.degree = data.degree
    profile.graduation_year = data.graduation_year
    if isinstance(data.skills, str):
        profile.skills = [s.strip() for s in data.skills.split(",") if s.strip()]
    elif isinstance(data.skills, list):
        profile.skills = data.skills
    profile.resume_url = data.resume_url
    profile.department = data.department
    profile.designation = data.designation
    profile.work_location = data.work_location
    if data.reporting_manager_id:
        profile.reporting_manager_id = data.reporting_manager_id
    if data.dob:
        try:
            profile.dob = date.fromisoformat(data.dob)
        except (ValueError, TypeError):
            pass
    if data.joining_date:
        try:
            profile.joining_date = date.fromisoformat(data.joining_date)
        except (ValueError, TypeError):
            pass

    db.commit()
    db.refresh(user)
    db.refresh(profile)

    return {
        "message": "Profile completed successfully.",
        "user_id": user.id,
        "full_name": user.full_name,
        "onboarding_status": "completed",
        "profile_status": "complete",
    }


@router.get(
    "/{user_id}",
    response_model=StaffProfileDetails,
)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    allowed_ids = authorized_staff_ids(db, current_user)
    if allowed_ids is not None and user_id not in allowed_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    invitation = (
        db.query(UserInvitation)
        .filter(UserInvitation.user_id == user.id)
        .first()
    )
    reporting_manager = (
        db.query(User).filter(User.id == profile.reporting_manager_id).first()
        if profile and profile.reporting_manager_id
        else None
    )
    task_proj_rows = (
        db.query(Task.project_id)
        .join(TaskAssignment, TaskAssignment.task_id == Task.id)
        .filter(TaskAssignment.user_id == user.id, Task.project_id.isnot(None))
        .distinct()
        .all()
    )
    distinct_project_ids = {row[0] for row in task_proj_rows if row[0] is not None}
    if user.role == "manager":
        managed_rows = db.query(Project.id).filter(Project.manager_id == user.id).all()
        distinct_project_ids.update(r[0] for r in managed_rows if r[0] is not None)

    assigned_projects = []
    if distinct_project_ids:
        project_query = db.query(Project).filter(Project.id.in_(distinct_project_ids))
        if current_user.role == "manager":
            project_ids = select(Project.id).filter(Project.manager_id == current_user.id)
            project_query = project_query.filter(Project.id.in_(project_ids))
        assigned_projects = (
            project_query.order_by(Project.start_date.desc(), Project.id.desc()).all()
        )

    result = staff_list_item(user, profile, invitation)
    result.update(
        {
            "joining_date": profile.joining_date if profile else None,
            "skills": (
                profile.skills
                if profile and isinstance(profile.skills, list)
                else None
            ),
            "reporting_manager": (
                ProjectManagerSummary(
                    id=reporting_manager.id,
                    full_name=reporting_manager.full_name,
                    email=reporting_manager.email,
                )
                if reporting_manager
                else None
            ),
            "education": [
                EducationDetails(
                    id=education.id,
                    institution=education.institution,
                    qualification=education.qualification,
                    field_of_study=education.field_of_study,
                    start_date=education.start_date,
                    end_date=education.end_date,
                )
                for education in (profile.education if profile else [])
            ],
            "assigned_projects": [
                AssignedProjectSummary(
                    id=project.id,
                    name=project.name,
                    department=project.department,
                    status=project.status,
                )
                for project in assigned_projects
            ],
        }
    )
    return result


@router.patch("/{user_id}/status", response_model=UserResponse)
def update_user_status(
    user_id: int,
    data: UserStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if data.status == user.status:
        return user

    if data.status != "active" and user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot deactivate your own account",
        )

    if data.status == "active" and not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The user must complete invitation registration before activation.",
        )

    if data.status != "active" and user.role == "admin" and user.status == "active":
        active_admins = (
            db.query(User)
            .filter(User.role == "admin", User.status == "active")
            .with_for_update()
            .all()
        )
        if len(active_admins) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The last active admin cannot be deactivated",
            )

    user.status = data.status
    if data.status == "inactive":
        invitation = (
            db.query(UserInvitation)
            .filter(UserInvitation.user_id == user.id)
            .with_for_update()
            .first()
        )
        if invitation and invitation.completed_at is None:
            invitation.revoked_at = utc_now()
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    data: UserRoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot change your own role",
        )

    user.role = data.role
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    if profile:
        new_cat = {
            "employee": StaffCategory.EMPLOYEE,
            "team_lead": StaffCategory.EMPLOYEE,
            "intern": StaffCategory.INTERN,
            "manager": StaffCategory.MANAGER,
        }.get(data.role)
        profile.staff_category = new_cat
        prefix = {
            "employee": "EMP",
            "team_lead": "TLD",
            "intern": "INT",
            "manager": "MGR",
        }.get(data.role, "STF")
        profile.staff_id = f"{prefix}-{user.id:04d}"
        if data.role in ("employee", "team_lead"):
            profile.employee_id = profile.staff_id
            profile.intern_id = None
        elif data.role == "intern":
            profile.intern_id = profile.staff_id
            profile.employee_id = None
        else:
            profile.employee_id = None
            profile.intern_id = None

    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/admin-profile", response_model=StaffListItem)
def admin_update_user_profile(
    user_id: int,
    data: AdminUserProfileUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    clean_name = data.full_name.strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Full name cannot be empty",
        )

    user.full_name = clean_name
    if user.profile_status == "incomplete" and user.password_hash is not None:
        user.profile_status = "complete"

    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    if not profile:
        prefix = {
            "employee": "EMP",
            "team_lead": "TLD",
            "intern": "INT",
            "manager": "MGR",
        }.get(user.role, "STF")
        staff_id = data.staff_id.strip() if data.staff_id else f"{prefix}-{user.id:04d}"
        staff_category = {
            "employee": StaffCategory.EMPLOYEE,
            "team_lead": StaffCategory.EMPLOYEE,
            "intern": StaffCategory.INTERN,
            "manager": StaffCategory.MANAGER,
        }.get(user.role)

        profile = StaffProfile(
            user_id=user.id,
            staff_category=staff_category,
            staff_id=staff_id,
            employee_id=staff_id if user.role in ("employee", "team_lead") else None,
            intern_id=staff_id if user.role == "intern" else None,
            department=data.department.strip() if data.department else "Ingage",
        )
        db.add(profile)
    else:
        if data.department:
            profile.department = data.department.strip()
        if data.staff_id:
            cleaned_staff_id = data.staff_id.strip()
            profile.staff_id = cleaned_staff_id
            if user.role in ("employee", "team_lead"):
                profile.employee_id = cleaned_staff_id
            elif user.role == "intern":
                profile.intern_id = cleaned_staff_id

    invitation = (
        db.query(UserInvitation)
        .filter(UserInvitation.user_id == user.id)
        .first()
    )

    db.commit()
    db.refresh(user)
    db.refresh(profile)
    return staff_list_item(user, profile, invitation)

