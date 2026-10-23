from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.invitation import UserInvitation
from app.models.staff_profile import StaffCategory, StaffProfile
from app.models.user import User
from app.schemas.auth import LoginRequest, ChangePasswordRequest
from app.schemas.invitations import (
    InvitationRegistration,
    InvitationRegistrationResponse,
    InvitationValidateRequest,
    InvitationValidateResponse,
)
from app.security import verify_password, create_access_token, hash_password
from app.dependencies.auth import get_current_user
from app.services.invitation_email import (
    ensure_utc,
    hash_invitation_token,
    utc_now,
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = (
        db.query(User)
        .filter(func.lower(User.email) == data.email.strip().lower())
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    valid_password = bool(user.password_hash and verify_password(data.password, user.password_hash))

    if user.status != "active" or not valid_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user.id, user.role)

    # Record successful login session with backend UTC timestamp
    from app.services.attendance_service import check_in_user
    try:
        check_in_user(db=db, user=user, source="web_login")
    except Exception:
        pass

    profile_status = getattr(user, "profile_status", "complete") or "complete"
    must_change_password = bool(getattr(user, "must_change_password", False))
    onboarding_status = getattr(user, "onboarding_status", "completed") or "completed"
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "profile_status": profile_status,
        "must_change_password": must_change_password,
        "onboarding_status": onboarding_status,
    }


@router.get("/me")
def get_my_account(user=Depends(get_current_user)):
    profile_status = getattr(user, "profile_status", "complete") or "complete"
    must_change_password = bool(getattr(user, "must_change_password", False))
    onboarding_status = getattr(user, "onboarding_status", "completed") or "completed"
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "role": user.role,
        "status": user.status,
        "profile_status": profile_status,
        "must_change_password": must_change_password,
        "onboarding_status": onboarding_status,
    }


@router.post("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not user.password_hash or not verify_password(data.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current temporary password is incorrect.",
        )
    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation do not match.",
        )
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long.",
        )
    if data.new_password == data.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be the same as your temporary password.",
        )

    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    db.commit()
    db.refresh(user)

    # Rotate/issue fresh access token
    new_token = create_access_token(user.id, user.role)
    return {
        "message": "Password changed successfully.",
        "access_token": new_token,
        "token_type": "bearer",
        "role": user.role,
        "must_change_password": False,
        "onboarding_status": getattr(user, "onboarding_status", "completed"),
        "profile_status": getattr(user, "profile_status", "complete"),
    }


@router.post(
    "/invitations/validate",
    response_model=InvitationValidateResponse,
)
def validate_invitation(
    data: InvitationValidateRequest,
    db: Session = Depends(get_db),
):
    token_hash = hash_invitation_token(data.token)
    invitation = (
        db.query(UserInvitation)
        .filter(UserInvitation.token_hash == token_hash)
        .first()
    )
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link is invalid.",
        )
    if invitation.completed_at is not None or invitation.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This invitation link has already been used.",
        )
    if invitation.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation link has been revoked. Ask an admin to resend it.",
        )
    if invitation.sent_at is None or invitation.expires_at is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation is not available. Ask an admin to resend it.",
        )

    now = utc_now()
    if ensure_utc(invitation.expires_at) <= now:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation link has expired. Ask an admin to resend it.",
        )

    # Check duplicate email
    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == invitation.email.lower())
        .first()
    )
    if existing_user is not None and existing_user.password_hash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account has already been registered with this email address.",
        )

    return {
        "valid": True,
        "email": invitation.email,
        "role": invitation.role,
    }


@router.post(
    "/invitations/register",
    response_model=InvitationRegistrationResponse,
)
def register_invitation(
    data: InvitationRegistration,
    db: Session = Depends(get_db),
):
    if data.password_confirmation and data.password != data.password_confirmation:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The passwords do not match.",
        )

    token_hash = hash_invitation_token(data.token)
    invitation = (
        db.query(UserInvitation)
        .filter(UserInvitation.token_hash == token_hash)
        .with_for_update()
        .first()
    )
    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation link is invalid.",
        )
    if invitation.completed_at is not None or invitation.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This invitation link has already been used.",
        )
    if invitation.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation link has been revoked. Ask an admin to resend it.",
        )
    if invitation.sent_at is None or invitation.expires_at is None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation is not available. Ask an admin to resend it.",
        )

    now = utc_now()
    if ensure_utc(invitation.expires_at) <= now:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This invitation link has expired. Ask an admin to resend it.",
        )

    # Check duplicate email in users table atomically
    existing_user = (
        db.query(User)
        .filter(func.lower(User.email) == invitation.email.lower())
        .with_for_update()
        .first()
    )
    if existing_user is not None and existing_user.password_hash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # Server-side security: role is strictly taken from invitation.role
    assigned_role = invitation.role

    if existing_user is not None:
        new_user = existing_user
        new_user.password_hash = hash_password(data.password)
        if data.full_name and not new_user.full_name:
            new_user.full_name = data.full_name.strip()
        new_user.status = "active"
        new_user.must_change_password = False
        new_user.onboarding_status = "pending"
        new_user.profile_status = "incomplete"
    else:
        new_user = User(
            full_name=(data.full_name or "").strip(),
            email=invitation.email.lower(),
            password_hash=hash_password(data.password),
            role=assigned_role,
            status="active",
            must_change_password=False,
            onboarding_status="pending",
            profile_status="incomplete",
        )
        db.add(new_user)
        db.flush()

    # Create initial staff profile if not already existing
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == new_user.id).first()
    if profile is None:
        prefix = {
            "employee": "EMP",
            "intern": "INT",
            "manager": "MGR",
            "team_lead": "TLD",
        }.get(assigned_role, "STF")
        staff_id = f"{prefix}-{new_user.id:04d}"

        staff_category = {
            "employee": StaffCategory.EMPLOYEE,
            "team_lead": StaffCategory.EMPLOYEE,
            "intern": StaffCategory.INTERN,
            "manager": StaffCategory.MANAGER,
        }.get(assigned_role)

        profile = StaffProfile(
            user_id=new_user.id,
            staff_category=staff_category,
            staff_id=staff_id,
            employee_id=staff_id if assigned_role in ("employee", "team_lead") else None,
            intern_id=staff_id if assigned_role == "intern" else None,
            department=data.department.strip() if data.department else "Ingage",
            mobile=data.mobile.strip() if data.mobile else None,
        )
        db.add(profile)
    else:
        if data.department and not profile.department:
            profile.department = data.department.strip()
        if data.mobile and not profile.mobile:
            profile.mobile = data.mobile.strip()


    # Atomically consume the token
    invitation.completed_at = now
    invitation.status = "completed"
    invitation.user_id = new_user.id

    db.commit()
    db.refresh(new_user)
    db.refresh(invitation)

    return {
        "id": new_user.id,
        "full_name": new_user.full_name,
        "email": new_user.email,
        "role": new_user.role,
        "status": new_user.status,
        "profile_status": new_user.profile_status,
        "registration_completed_at": invitation.completed_at,
    }


# Backwards compatibility alias
@router.post(
    "/register-invitation",
    response_model=InvitationRegistrationResponse,
)
def register_invitation_alias(
    data: InvitationRegistration,
    db: Session = Depends(get_db),
):
    return register_invitation(data, db)