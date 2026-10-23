from fastapi import Depends, HTTPException, status

from app.dependencies.auth import get_current_user


def require_onboarded_user(user=Depends(get_current_user)):
    # Admins have administrative privileges and are never blocked by onboarding gates
    if getattr(user, "role", None) == "admin":
        return user

    if getattr(user, "must_change_password", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password reset is required before accessing system resources.",
        )

    if (
        getattr(user, "profile_status", "complete") == "incomplete"
        or getattr(user, "onboarding_status", "completed") == "pending"
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Profile completion is required before accessing system resources.",
        )

    return user


def require_admin(user=Depends(require_onboarded_user)):
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin permission required",
        )
    return user


def require_admin_or_manager(user=Depends(require_onboarded_user)):
    if user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    return user


def require_project_reader(user=Depends(require_onboarded_user)):
    if user.role not in ("admin", "manager", "team_lead", "employee", "intern"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied",
        )
    return user