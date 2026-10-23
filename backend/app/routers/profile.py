import os
import re
import shutil
import uuid
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies.auth import get_current_user, get_db
from app.models.project import Project
from app.models.staff_profile import StaffCategory, StaffProfile
from app.models.task import Task, TaskAssignment
from app.models.user import User
from app.schemas.profile import (
    AssignedProjectItem,
    CertificationItem,
    EducationRecordItem,
    ExperienceItem,
    LanguageItem,
    ManagerOption,
    MyProfileResponse,
    PortfolioProjectItem,
    ProfileCompletionRequest,
)

router = APIRouter(prefix="/api/users/profile", tags=["User Profile"])

PROFILE_UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "profiles"
PROFILE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".pdf", ".doc", ".docx"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


def calculate_profile_completion(user: User, profile: StaffProfile) -> int:
    score = 0
    if user.full_name and user.full_name.strip():
        score += 15
    if profile.mobile and profile.mobile.strip():
        score += 15
    if profile.department:
        score += 10
    if profile.highest_qualification or (isinstance(profile.education_records, list) and len(profile.education_records) > 0):
        score += 15
    if isinstance(profile.skills, list) and len(profile.skills) > 0:
        score += 10
    if isinstance(profile.soft_skills, list) and len(profile.soft_skills) > 0:
        score += 5
    if isinstance(profile.languages, list) and len(profile.languages) > 0:
        score += 5
    if profile.profile_photo:
        score += 10
    if profile.city or profile.state or profile.country or profile.address:
        score += 5
    
    prof_links = profile.professional_links if isinstance(profile.professional_links, dict) else {}
    has_extras = bool(
        (isinstance(profile.certifications, list) and len(profile.certifications) > 0)
        or (isinstance(profile.work_experience, list) and len(profile.work_experience) > 0)
        or (isinstance(profile.projects, list) and len(profile.projects) > 0)
        or profile.resume_url
        or any(prof_links.values())
    )
    if has_extras:
        score += 10

    return min(100, score)


def ensure_profile_and_staff_id(db: Session, user: User) -> StaffProfile:
    profile = db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
    prefix = {
        "employee": "EMP",
        "intern": "INT",
        "manager": "MGR",
        "team_lead": "TLD",
        "admin": "ADM",
    }.get(user.role, "STF")
    expected_staff_id = f"{prefix}-{user.id:04d}"

    if profile is None:
        staff_cat = {
            "employee": StaffCategory.EMPLOYEE,
            "intern": StaffCategory.INTERN,
            "manager": StaffCategory.MANAGER,
        }.get(user.role)

        profile = StaffProfile(
            user_id=user.id,
            staff_category=staff_cat,
            staff_id=expected_staff_id,
            employee_id=expected_staff_id if user.role == "employee" else None,
            intern_id=expected_staff_id if user.role == "intern" else None,
            skills=[],
            soft_skills=[],
            languages=[],
            certifications=[],
            work_experience=[],
            projects=[],
            education_records=[],
            professional_links={},
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)
    elif not profile.staff_id:
        profile.staff_id = expected_staff_id
        if user.role == "employee" and not profile.employee_id:
            profile.employee_id = expected_staff_id
        elif user.role == "intern" and not profile.intern_id:
            profile.intern_id = expected_staff_id
        db.commit()
        db.refresh(profile)

    return profile


def get_user_assigned_projects(db: Session, user: User) -> list[AssignedProjectItem]:
    task_proj_rows = (
        db.query(Task.project_id)
        .join(TaskAssignment, TaskAssignment.task_id == Task.id)
        .filter(TaskAssignment.user_id == user.id, Task.project_id.isnot(None))
        .distinct()
        .all()
    )
    distinct_project_ids = {row[0] for row in task_proj_rows if row[0] is not None}
    if user.role in ("manager", "team_lead"):
        managed_rows = db.query(Project.id).filter(Project.manager_id == user.id).all()
        distinct_project_ids.update(r[0] for r in managed_rows if r[0] is not None)

    if not distinct_project_ids:
        return []

    projects = (
        db.query(Project)
        .filter(Project.id.in_(distinct_project_ids))
        .order_by(Project.name.asc())
        .all()
    )
    return [
        AssignedProjectItem(
            id=p.id,
            name=p.name,
            department=p.department,
            status=p.status,
        )
        for p in projects
    ]


def get_available_managers(db: Session, current_user_id: int) -> list[ManagerOption]:
    managers = (
        db.query(User)
        .filter(
            User.role.in_(("admin", "manager")),
            User.status == "active",
            User.id != current_user_id,
        )
        .order_by(User.full_name.asc())
        .all()
    )
    manager_profiles = {
        p.user_id: p.department
        for p in db.query(StaffProfile).filter(
            StaffProfile.user_id.in_([m.id for m in managers])
        ).all()
    }

    return [
        ManagerOption(
            id=m.id,
            full_name=m.full_name or m.email,
            email=m.email,
            role=m.role,
            department=manager_profiles.get(m.id),
        )
        for m in managers
    ]


@router.get("/me", response_model=MyProfileResponse)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    profile = ensure_profile_and_staff_id(db, current_user)
    assigned_projects = get_user_assigned_projects(db, current_user)
    available_managers = get_available_managers(db, current_user.id)

    reporting_manager_name = None
    if profile.reporting_manager_id:
        rm = db.query(User.full_name).filter(User.id == profile.reporting_manager_id).first()
        if rm:
            reporting_manager_name = rm[0]

    completion_pct = calculate_profile_completion(current_user, profile)

    return MyProfileResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        status=current_user.status,
        profile_status=getattr(current_user, "profile_status", "incomplete") or "incomplete",
        staff_id=profile.staff_id,
        full_name=current_user.full_name or "",
        mobile=profile.mobile,
        profile_photo=profile.profile_photo,
        dob=profile.dob,
        gender=profile.gender,
        address=profile.address,
        city=profile.city,
        state=profile.state,
        country=profile.country,
        highest_qualification=profile.highest_qualification,
        institution=profile.institution,
        degree=profile.degree,
        graduation_year=profile.graduation_year,
        education_records=profile.education_records if isinstance(profile.education_records, list) else [],
        skills=profile.skills if isinstance(profile.skills, list) else [],
        soft_skills=profile.soft_skills if isinstance(profile.soft_skills, list) else [],
        languages=profile.languages if isinstance(profile.languages, list) else [],
        certifications=profile.certifications if isinstance(profile.certifications, list) else [],
        work_experience=profile.work_experience if isinstance(profile.work_experience, list) else [],
        projects=profile.projects if isinstance(profile.projects, list) else [],
        professional_links=profile.professional_links if isinstance(profile.professional_links, dict) else {},
        resume_url=profile.resume_url,
        department=profile.department,
        designation=profile.designation,
        joining_date=profile.joining_date,
        reporting_manager_id=profile.reporting_manager_id,
        reporting_manager_name=reporting_manager_name,
        work_location=profile.work_location,
        assigned_projects=assigned_projects,
        profile_completion_percentage=completion_pct,
        available_managers=available_managers,
        available_departments=["Ingage", "Rezov", "Edutech"],
    )


@router.post("/complete", response_model=MyProfileResponse)
@router.put("/me", response_model=MyProfileResponse)
def complete_or_update_profile(
    payload: ProfileCompletionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    full_name = payload.full_name.strip()
    if not full_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Full Name is required.",
        )
    mobile = payload.mobile.strip()
    if not mobile or len(mobile) < 7:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A valid Mobile Number is required.",
        )

    profile = ensure_profile_and_staff_id(db, current_user)

    # Validate reporting manager if provided
    if payload.reporting_manager_id:
        mgr = (
            db.query(User)
            .filter(
                User.id == payload.reporting_manager_id,
                User.role.in_(("admin", "manager")),
                User.status == "active",
            )
            .first()
        )
        if not mgr:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected reporting manager is invalid or inactive.",
            )

    # Department validation
    if payload.department and payload.department not in ("Ingage", "Rezov", "Edutech"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Department must be Ingage, Rezov, or Edutech.",
        )

    # Highest Qualification validation
    has_qualification = bool(
        payload.highest_qualification
        or (
            payload.education_records
            and len(payload.education_records) > 0
            and (getattr(payload.education_records[0], "highest_qualification", None) or getattr(payload.education_records[0], "degree", None))
        )
    )
    if not has_qualification and not profile.highest_qualification:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Highest Qualification is required.",
        )

    # 1. Update User
    current_user.full_name = full_name
    current_user.profile_status = "complete"
    current_user.onboarding_status = "completed"

    # 2. Update Profile Core Personal
    profile.mobile = mobile
    if payload.profile_photo is not None:
        profile.profile_photo = payload.profile_photo
    profile.dob = payload.dob
    profile.gender = payload.gender
    profile.address = payload.address
    profile.city = payload.city
    profile.state = payload.state
    profile.country = payload.country

    # 3. Update Education
    if payload.highest_qualification:
        profile.highest_qualification = payload.highest_qualification
    elif payload.education_records and len(payload.education_records) > 0:
        first_edu = payload.education_records[0]
        profile.highest_qualification = getattr(first_edu, "highest_qualification", None) or profile.highest_qualification
        profile.institution = getattr(first_edu, "institution", None) or profile.institution
        profile.degree = getattr(first_edu, "degree", None) or profile.degree
        profile.graduation_year = getattr(first_edu, "passing_year", None) or profile.graduation_year

    if payload.institution is not None:
        profile.institution = payload.institution
    if payload.degree is not None:
        profile.degree = payload.degree
    if payload.graduation_year is not None:
        profile.graduation_year = payload.graduation_year

    if payload.education_records is not None:
        profile.education_records = [
            e.model_dump() if hasattr(e, "model_dump") else e
            for e in payload.education_records
        ]

    # 4. Skills, Languages, Experiences, Certifications, Projects
    if payload.skills is not None:
        profile.skills = payload.skills
    if payload.soft_skills is not None:
        profile.soft_skills = payload.soft_skills
    if payload.languages is not None:
        profile.languages = [
            l.model_dump() if hasattr(l, "model_dump") else l
            for l in payload.languages
        ]
    if payload.certifications is not None:
        profile.certifications = [
            c.model_dump() if hasattr(c, "model_dump") else c
            for c in payload.certifications
        ]
    if payload.work_experience is not None:
        profile.work_experience = [
            w.model_dump() if hasattr(w, "model_dump") else w
            for w in payload.work_experience
        ]
    if payload.projects is not None:
        profile.projects = [
            p.model_dump() if hasattr(p, "model_dump") else p
            for p in payload.projects
        ]
    if payload.professional_links is not None:
        profile.professional_links = (
            payload.professional_links.model_dump()
            if hasattr(payload.professional_links, "model_dump")
            else payload.professional_links
        )
    if payload.resume_url is not None:
        profile.resume_url = payload.resume_url

    # 5. Work details
    if payload.department:
        profile.department = payload.department
    if payload.designation is not None:
        profile.designation = payload.designation
    if payload.joining_date:
        profile.joining_date = payload.joining_date
    if payload.reporting_manager_id:
        profile.reporting_manager_id = payload.reporting_manager_id
    if payload.work_location is not None:
        profile.work_location = payload.work_location

    db.commit()
    db.refresh(current_user)
    db.refresh(profile)

    return get_my_profile(db=db, current_user=current_user)


@router.post("/upload")
def upload_profile_asset(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Secure endpoint for uploading profile photos, resumes, and certificate files."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Sanitize and unique filename
    safe_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", Path(file.filename).stem)[:40]
    unique_filename = f"user_{current_user.id}_{safe_stem}_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = PROFILE_UPLOAD_DIR / unique_filename

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Check size
    if dest_path.stat().st_size > MAX_FILE_SIZE:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="File exceeds maximum allowed size of 5MB.")

    return {
        "url": f"/api/users/profile/files/{unique_filename}",
        "filename": file.filename,
        "size": dest_path.stat().st_size,
    }


@router.get("/files/{filename}")
def get_profile_file(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    safe_filename = Path(filename).name
    file_path = PROFILE_UPLOAD_DIR / safe_filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    return FileResponse(
        path=file_path,
        filename=safe_filename,
    )
