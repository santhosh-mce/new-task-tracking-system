from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies.auth import get_db
from app.dependencies.permissions import require_admin
from app.models.invitation import UserInvitation
from app.models.staff_profile import StaffCategory, StaffProfile
from app.models.user import User
from app.schemas.invitations import (
    AdminInvitationCreate,
    AdminInvitationResponse,
)
from app.security import hash_password
from app.services.invitation_email import (
    InvitationEmailError,
    ensure_utc,
    generate_invitation_token,
    hash_invitation_token,
    record_invitation_attempt,
    send_invitation_email,
    send_temporary_password_email,
    utc_now,
)

router = APIRouter(prefix="/api/admin/invitations", tags=["Admin Invitations"])


def compute_invitation_status(invitation: UserInvitation, now) -> str:
    if invitation.completed_at:
        return "Registration Completed"
    if invitation.revoked_at:
        return "Revoked"
    if invitation.expires_at and ensure_utc(invitation.expires_at) <= now:
        return "Expired"
    return "Pending"


@router.post(
    "",
    response_model=AdminInvitationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invitation(
    data: AdminInvitationCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    email = data.email
    if data.role == "manager" and admin.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only authorized Administrators may invite Managers.",
        )

    # Check if a user account already exists
    existing_user = (
        db.query(User.id)
        .filter(func.lower(User.email) == email)
        .first()
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A registered account with this email address already exists.",
        )

    # Check for existing invitation for this email
    invitation = (
        db.query(UserInvitation)
        .filter(func.lower(UserInvitation.email) == email)
        .order_by(UserInvitation.id.desc())
        .first()
    )

    now = utc_now()
    if invitation is None:
        invitation = UserInvitation(
            email=email,
            role=data.role,
            invited_by_id=admin.id,
            status="pending",
        )
        db.add(invitation)
    else:
        if invitation.completed_at:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Registration has already been completed for this invitation.",
            )
        invitation.role = data.role
        invitation.invited_by_id = admin.id
        invitation.revoked_at = None
        invitation.status = "pending"

    record_invitation_attempt(invitation, now)

    user_full_name = (data.full_name or "").strip()
    user_dept = (data.department or "Ingage").strip()

    if data.temporary_password:
        temp_pass = data.temporary_password.strip()
        if len(temp_pass) < 8:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Temporary password must be at least 8 characters long.",
            )
        # Create user account securely in the database
        user = User(
            full_name=user_full_name,
            email=email,
            password_hash=hash_password(temp_pass),
            role=data.role,
            status="active",
            must_change_password=True,
            onboarding_status="pending",
            profile_status="incomplete",
        )
        db.add(user)
        db.flush()

        prefix = {
            "employee": "EMP",
            "intern": "INT",
            "team_lead": "TLD",
            "manager": "MGR",
        }.get(data.role, "STF")
        custom_id = data.employee_id.strip() if data.employee_id else None
        staff_id = custom_id or f"{prefix}-{user.id:04d}"

        staff_category = {
            "employee": StaffCategory.EMPLOYEE,
            "team_lead": StaffCategory.EMPLOYEE,
            "intern": StaffCategory.INTERN,
            "manager": StaffCategory.MANAGER,
        }.get(data.role)

        profile = StaffProfile(
            user_id=user.id,
            staff_category=staff_category,
            staff_id=staff_id,
            employee_id=staff_id if data.role in ("employee", "team_lead") else None,
            intern_id=staff_id if data.role == "intern" else None,
            department=user_dept,
        )
        db.add(profile)

        invitation.user_id = user.id
        invitation.sent_at = now
        invitation.status = "pending"
        db.flush()

        email_sent = True
        message_note = None
        try:
            send_temporary_password_email(
                email=email,
                role=data.role,
                temporary_password=temp_pass,
            )
        except InvitationEmailError as exc:
            email_sent = False
            message_note = f"User created, but email could not be sent: {exc}"

        db.commit()
        db.refresh(invitation)

        return {
            "id": invitation.id,
            "email": invitation.email,
            "role": invitation.role,
            "status": "Pending",
            "full_name": user.full_name,
            "department": profile.department,
            "staff_id": profile.staff_id,
            "setup_link": None,
            "email_sent": email_sent,
            "message": message_note or "User account created successfully.",
            "sent_at": invitation.sent_at,
            "expires_at": invitation.expires_at,
            "completed_at": invitation.completed_at,
        }

    # Setup Link flow (Default and recommended)
    # 1. Pre-create the User with status='invitation_pending' and null password
    user = User(
        full_name=user_full_name,
        email=email,
        password_hash=None,
        role=data.role,
        status="invitation_pending",
        must_change_password=False,
        onboarding_status="pending",
        profile_status="incomplete",
    )
    db.add(user)
    db.flush()

    prefix = {
        "employee": "EMP",
        "intern": "INT",
        "team_lead": "TLD",
        "manager": "MGR",
    }.get(data.role, "STF")
    custom_id = data.employee_id.strip() if data.employee_id else None
    staff_id = custom_id or f"{prefix}-{user.id:04d}"

    staff_category = {
        "employee": StaffCategory.EMPLOYEE,
        "team_lead": StaffCategory.EMPLOYEE,
        "intern": StaffCategory.INTERN,
        "manager": StaffCategory.MANAGER,
    }.get(data.role)

    profile = StaffProfile(
        user_id=user.id,
        staff_category=staff_category,
        staff_id=staff_id,
        employee_id=staff_id if data.role in ("employee", "team_lead") else None,
        intern_id=staff_id if data.role == "intern" else None,
        department=user_dept,
    )
    db.add(profile)

    token = generate_invitation_token()
    invitation.user_id = user.id
    invitation.token_hash = hash_invitation_token(token)
    invitation.sent_at = now
    invitation.expires_at = now + timedelta(minutes=5)  # 5 mins time-limited link
    db.flush()

    from urllib.parse import quote
    import os
    frontend_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
    setup_link = f"{frontend_url}/register?token={quote(token, safe='')}"

    email_sent = True
    message_note = None
    try:
        send_invitation_email(
            email=invitation.email,
            role=invitation.role,
            token=token,
            expires_at=invitation.expires_at,
        )
    except InvitationEmailError as exc:
        email_sent = False
        message_note = f"User created in database, but setup email could not be sent: {exc}"

    db.commit()
    db.refresh(invitation)

    return {
        "id": invitation.id,
        "email": invitation.email,
        "role": invitation.role,
        "status": "Pending",
        "full_name": user.full_name,
        "department": profile.department,
        "staff_id": profile.staff_id,
        "setup_link": setup_link,
        "email_sent": email_sent,
        "message": message_note or "User created and setup link generated successfully.",
        "sent_at": invitation.sent_at,
        "expires_at": invitation.expires_at,
        "completed_at": invitation.completed_at,
    }


@router.get(
    "",
    response_model=list[AdminInvitationResponse],
)
def list_invitations(
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    invitations = (
        db.query(UserInvitation)
        .order_by(UserInvitation.id.desc())
        .all()
    )
    now = utc_now()
    results = []
    for inv in invitations:
        computed_status = compute_invitation_status(inv, now)
        if status_filter:
            sf = status_filter.strip().lower()
            if sf == "pending" and computed_status != "Pending":
                continue
            if sf == "expired" and computed_status != "Expired":
                continue
            if sf == "completed" and computed_status != "Registration Completed":
                continue

        results.append({
            "id": inv.id,
            "email": inv.email,
            "role": inv.role,
            "status": computed_status,
            "sent_at": inv.sent_at,
            "expires_at": inv.expires_at,
            "completed_at": inv.completed_at,
        })
    return results


@router.post(
    "/{id}/resend",
    response_model=AdminInvitationResponse,
)
def resend_invitation(
    id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    invitation = (
        db.query(UserInvitation)
        .filter(UserInvitation.id == id)
        .with_for_update()
        .first()
    )
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found.",
        )

    # Check if a user account already exists
    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == invitation.email.lower())
        .first()
    )
    if invitation.completed_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registration has already been completed for this account.",
        )

    now = utc_now()
    record_invitation_attempt(invitation, now)

    if existing_user and existing_user.password_hash is not None:
        import secrets
        new_temp_pass = f"TaskFlow@{secrets.randbelow(9000) + 1000}"
        existing_user.password_hash = hash_password(new_temp_pass)
        invitation.sent_at = now
        db.flush()

        try:
            send_temporary_password_email(
                email=existing_user.email,
                role=existing_user.role,
                temporary_password=new_temp_pass,
            )
            db.commit()
            db.refresh(invitation)
        except InvitationEmailError as exc:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Unable to resend invitation email: {exc}",
            ) from exc

        return {
            "id": invitation.id,
            "email": invitation.email,
            "role": invitation.role,
            "status": "Pending",
            "sent_at": invitation.sent_at,
            "expires_at": invitation.expires_at,
            "completed_at": invitation.completed_at,
        }

    token = generate_invitation_token()
    invitation.token_hash = hash_invitation_token(token)
    invitation.sent_at = now
    invitation.expires_at = now + timedelta(minutes=5)
    invitation.revoked_at = None
    invitation.status = "pending"
    db.flush()

    try:
        send_invitation_email(
            email=invitation.email,
            role=invitation.role,
            token=token,
            expires_at=invitation.expires_at,
        )
        db.commit()
        db.refresh(invitation)
    except InvitationEmailError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unable to resend invitation email: {exc}",
        ) from exc

    from urllib.parse import quote
    import os
    frontend_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
    setup_link = f"{frontend_url}/register?token={quote(token, safe='')}"

    return {
        "id": invitation.id,
        "email": invitation.email,
        "role": invitation.role,
        "status": "Pending",
        "setup_link": setup_link,
        "email_sent": True,
        "sent_at": invitation.sent_at,
        "expires_at": invitation.expires_at,
        "completed_at": invitation.completed_at,
    }


@router.post(
    "/by-email/{email}/resend",
    response_model=AdminInvitationResponse,
)
def resend_invitation_by_email(
    email: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    invitation = (
        db.query(UserInvitation)
        .filter(func.lower(UserInvitation.email) == email.strip().lower())
        .order_by(UserInvitation.id.desc())
        .first()
    )
    if not invitation:
        user = db.query(User).filter(func.lower(User.email) == email.strip().lower()).first()
        if user:
            invitation = UserInvitation(
                email=user.email,
                role=user.role,
                user_id=user.id,
                invited_by_id=admin.id,
                status="pending",
            )
            db.add(invitation)
            db.flush()
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No account or invitation found for this email address.",
            )

    return resend_invitation(id=invitation.id, db=db, admin=admin)
