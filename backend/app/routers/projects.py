import os
import re
import shutil
import uuid
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload

from app.dependencies.auth import get_current_user, get_db
from app.dependencies.permissions import require_project_reader
from app.models.project import (
    Project,
    ProjectDepartment,
    ProjectDocument,
    ProjectLink,
    ProjectMember,
    ProjectStatus,
)
from app.models.staff_profile import StaffCategory, StaffProfile
from app.models.task import Task, TaskAssignment
from app.models.user import User
from app.schemas.pagination import PageResponse
from app.schemas.projects import (
    ProjectCreate,
    ProjectDetails,
    ProjectDocumentResponse,
    ProjectDocumentUpdate,
    ProjectLinkCreate,
    ProjectLinkResponse,
    ProjectLinkUpdate,
    ProjectListItem,
    ProjectManagerSummary,
    ProjectMemberSummary,
    ProjectMembersAssignRequest,
    ProjectUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["Projects"])

# Safe storage setup
UPLOAD_BASE_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "projects"
UPLOAD_BASE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".csv",
    ".png",
    ".jpg",
    ".jpeg",
}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


def scoped_projects(db: Session, user: User):
    query = db.query(Project)
    if user.role == "manager":
        query = query.filter(Project.manager_id == user.id)
    elif user.role in ("employee", "intern"):
        member_proj_ids = db.query(ProjectMember.project_id).filter(ProjectMember.user_id == user.id)
        task_proj_ids = (
            db.query(Task.project_id)
            .join(TaskAssignment, TaskAssignment.task_id == Task.id)
            .filter(TaskAssignment.user_id == user.id, Task.project_id.isnot(None))
        )
        query = query.filter(or_(Project.id.in_(member_proj_ids), Project.id.in_(task_proj_ids)))
    return query



def project_access_or_404(db: Session, project_id: int, user: User) -> Project:
    project = scoped_projects(db, user).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    return project


def project_editor_access_or_404(db: Session, project_id: int, user: User) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    if user.role == "admin":
        return project
    if user.role == "manager":
        if project.manager_id == user.id:
            return project
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have permission to modify this project",
    )


def duration_days(project: Project) -> int:
    if not project.start_date or not project.end_date:
        return 0
    return max(0, (project.end_date - project.start_date).days + 1)


def get_project_metrics(db: Session, project_ids: list[int]):
    if not project_ids:
        return {}, {}

    task_rows = (
        db.query(
            Task.project_id,
            func.count(Task.id),
            func.sum(case((func.lower(Task.status) == "completed", 1), else_=0)),
        )
        .filter(Task.project_id.in_(project_ids))
        .group_by(Task.project_id)
        .all()
    )
    task_metrics = {
        project_id: (int(total or 0), int(completed or 0))
        for project_id, total, completed in task_rows
    }

    return task_metrics, {}


def project_list_item(
    project: Project,
    task_metrics: dict[int, tuple[int, int]],
    categories: dict[int, set[StaffCategory]],
    members: list[ProjectMemberSummary] | None = None,
) -> dict:
    tasks_total, tasks_completed = task_metrics.get(project.id, (0, 0))
    completion = round(tasks_completed * 100 / tasks_total, 2) if tasks_total else 0
    manager = project.manager
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "client_name": project.client_name,
        "department": project.department,
        "start_date": project.start_date,
        "end_date": project.end_date,
        "duration_days": duration_days(project),
        "completion_percent": completion,
        "tasks_total": tasks_total,
        "tasks_completed": tasks_completed,
        "status": project.status,
        "member_categories": sorted(
            categories.get(project.id, set()),
            key=lambda item: item.value,
        ),
        "manager": (
            ProjectManagerSummary(
                id=manager.id,
                full_name=manager.full_name,
                email=manager.email,
            )
            if manager
            else None
        ),
        "members": members or [],
    }


def is_project_team_eligible(user: User, profile: StaffProfile | None = None) -> bool:
    """Only Employee and Intern users belong to the Project Team summary.
    Admin and Manager are strictly excluded even if assigned to tasks."""
    role_lower = (user.role or "").strip().lower()
    if role_lower in ("admin", "manager"):
        return False
    if role_lower in ("employee", "intern"):
        return True
    if profile and profile.staff_category:
        cat_val = (
            profile.staff_category.value
            if hasattr(profile.staff_category, "value")
            else str(profile.staff_category)
        )
        if cat_val.strip().lower() in ("employee", "intern"):
            return True
    return False


def project_members(db: Session, project_id: int) -> list[ProjectMemberSummary]:
    assigned_users = (
        db.query(User)
        .join(TaskAssignment, TaskAssignment.user_id == User.id)
        .join(Task, Task.id == TaskAssignment.task_id)
        .filter(Task.project_id == project_id)
        .order_by(User.id.asc())
        .all()
    )
    if not assigned_users:
        return []

    user_ids = [u.id for u in assigned_users]
    profiles = {}
    if user_ids:
        prof_rows = db.query(StaffProfile).filter(StaffProfile.user_id.in_(user_ids)).all()
        profiles = {p.user_id: p for p in prof_rows}

    seen = set()
    result = []
    for u in assigned_users:
        if not u or u.id in seen:
            continue
        prof = profiles.get(u.id)
        if not is_project_team_eligible(u, prof):
            continue
        seen.add(u.id)
        result.append(
            ProjectMemberSummary(
                id=u.id,
                full_name=u.full_name,
                email=u.email,
                role=u.role,
                status=u.status,
                staff_category=prof.staff_category if prof else None,
                employee_id=prof.employee_id if prof else None,
                intern_id=prof.intern_id if prof else None,
                mobile=prof.mobile if prof else None,
                department=prof.department if prof else None,
                company_unit=prof.department if prof else None,
                avatar_url=None,
            )
        )
    return result


def filtered_projects(
    db: Session,
    user: User,
    q: str | None,
    project_status: ProjectStatus | None,
    department: ProjectDepartment | None,
    date_from: date | None,
    date_to: date | None,
):
    if isinstance(date_from, date) and isinstance(date_to, date) and date_from > date_to:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="date_from must be on or before date_to",
        )

    query = scoped_projects(db, user)
    if isinstance(q, str) and q.strip():
        search_pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Project.name.ilike(search_pattern),
                Project.description.ilike(search_pattern),
                Project.client_name.ilike(search_pattern),
            )
        )
    if isinstance(project_status, ProjectStatus) or (
        isinstance(project_status, str) and project_status
    ):
        query = query.filter(Project.status == project_status)
    if isinstance(department, ProjectDepartment) or (
        isinstance(department, str) and department
    ):
        query = query.filter(Project.department == department)
    if isinstance(date_from, date):
        query = query.filter(Project.end_date >= date_from)
    if isinstance(date_to, date):
        query = query.filter(Project.start_date <= date_to)
    return query


def validate_url_str(url: str) -> str:
    cleaned = url.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="URL must be a valid web address starting with http:// or https://",
        )
    return cleaned


# ==========================================
# Project CRUD Endpoints
# ==========================================

@router.get("", response_model=PageResponse[ProjectListItem])
def list_projects(
    q: str | None = Query(default=None, max_length=200),
    project_status: ProjectStatus | None = Query(default=None, alias="status"),
    department: ProjectDepartment | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_project_reader),
):
    cur_page = page if isinstance(page, int) and page >= 1 else 1
    cur_page_size = page_size if isinstance(page_size, int) and page_size >= 1 else 25

    query = filtered_projects(
        db,
        user,
        q,
        project_status,
        department,
        date_from,
        date_to,
    )
    total = query.count()
    projects = (
        query.options(joinedload(Project.manager))
        .order_by(Project.start_date.desc(), Project.id.desc())
        .offset((cur_page - 1) * cur_page_size)
        .limit(cur_page_size)
        .all()
    )
    ids = [project.id for project in projects]
    task_metrics, categories = get_project_metrics(db, ids)
    members_by_project: dict[int, list[ProjectMemberSummary]] = {}
    if ids:
        assigned_rows = (
            db.query(Task.project_id, User)
            .join(TaskAssignment, TaskAssignment.task_id == Task.id)
            .join(User, User.id == TaskAssignment.user_id)
            .filter(Task.project_id.in_(ids))
            .order_by(User.id.asc())
            .all()
        )
        user_ids = [u.id for _, u in assigned_rows if u]
        profiles = {}
        if user_ids:
            prof_rows = db.query(StaffProfile).filter(StaffProfile.user_id.in_(user_ids)).all()
            profiles = {p.user_id: p for p in prof_rows}

        for p_id, u in assigned_rows:
            if not u:
                continue
            p_list = members_by_project.setdefault(p_id, [])
            if any(existing.id == u.id for existing in p_list):
                continue
            prof = profiles.get(u.id)
            if not is_project_team_eligible(u, prof):
                continue
            p_list.append(
                ProjectMemberSummary(
                    id=u.id,
                    full_name=u.full_name,
                    email=u.email,
                    role=u.role,
                    status=u.status,
                    staff_category=prof.staff_category if prof else None,
                    employee_id=prof.employee_id if prof else None,
                    intern_id=prof.intern_id if prof else None,
                    mobile=prof.mobile if prof else None,
                    department=prof.department if prof else None,
                    company_unit=prof.department if prof else None,
                    avatar_url=None,
                )
            )

    return {
        "items": [
            project_list_item(
                project,
                task_metrics,
                categories,
                members=members_by_project.get(project.id, []),
            )
            for project in projects
        ],
        "total": total,
        "page": cur_page,
        "page_size": cur_page_size,
    }


@router.post("", response_model=ProjectDetails, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    if current_user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied. Only Admins and Managers can create projects.",
        )

    # Date range validation
    if payload.start_date > payload.end_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Start Date must be on or before End Date.",
        )

    # Manager validation
    manager_id = payload.manager_id
    if manager_id:
        manager_user = db.query(User).filter(User.id == manager_id, User.status == "active").first()
        if not manager_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected Project Manager does not exist or is inactive.",
            )
        if manager_user.role not in ("admin", "manager"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected Project Manager must have an Admin or Manager role.",
            )
    elif current_user.role == "manager":
        # Default manager to current user if manager created it
        manager_id = current_user.id

    # Validate links
    for link_item in payload.links or []:
        validate_url_str(link_item.url)

    # Create project
    project = Project(
        name=payload.name.strip(),
        description=payload.description.strip(),
        client_name=payload.client_name.strip() if payload.client_name else None,
        department=payload.department,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        manager_id=manager_id,
    )
    db.add(project)
    db.flush()

    # Add initial links
    for link_item in payload.links or []:
        db.add(
            ProjectLink(
                project_id=project.id,
                title=link_item.title.strip(),
                url=link_item.url.strip(),
                description=link_item.description.strip() if link_item.description else None,
            )
        )

    db.commit()
    db.refresh(project)

    return get_project(project.id, db=db, user=current_user)


@router.get("/{project_id}", response_model=ProjectDetails)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_project_reader),
):
    project = project_access_or_404(db, project_id, user)
    project = (
        db.query(Project)
        .options(
            joinedload(Project.manager),
            joinedload(Project.documents),
            joinedload(Project.links),
        )
        .filter(Project.id == project.id)
        .first()
    )
    task_metrics, categories = get_project_metrics(db, [project.id])
    members = project_members(db, project.id)
    result = project_list_item(project, task_metrics, categories, members=members)
    result["description"] = project.description
    result["documents"] = [
        ProjectDocumentResponse.model_validate(doc, from_attributes=True)
        for doc in (project.documents or [])
    ]
    result["links"] = [
        ProjectLinkResponse.model_validate(link, from_attributes=True)
        for link in (project.links or [])
    ]
    return result


@router.patch("/{project_id}", response_model=ProjectDetails)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project = project_editor_access_or_404(db, project_id, current_user)

    # Validate dates if updated
    new_start = payload.start_date if payload.start_date is not None else project.start_date
    new_end = payload.end_date if payload.end_date is not None else project.end_date
    if new_start and new_end and new_start > new_end:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Start Date must be on or before End Date.",
        )

    if payload.name is not None:
        project.name = payload.name.strip()
    if payload.description is not None:
        project.description = payload.description.strip()
    if payload.client_name is not None:
        project.client_name = payload.client_name.strip() if payload.client_name else None
    if payload.department is not None:
        project.department = payload.department
    if payload.start_date is not None:
        project.start_date = payload.start_date
    if payload.end_date is not None:
        project.end_date = payload.end_date
    if payload.status is not None:
        project.status = payload.status

    if payload.manager_id is not None:
        if payload.manager_id > 0:
            manager_user = db.query(User).filter(User.id == payload.manager_id, User.status == "active").first()
            if not manager_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected Project Manager does not exist or is inactive.",
                )
            if manager_user.role not in ("admin", "manager"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected Project Manager must have an Admin or Manager role.",
                )
            project.manager_id = manager_user.id
        else:
            project.manager_id = None

    db.commit()
    db.refresh(project)

    return get_project(project.id, db=db, user=current_user)


@router.get(
    "/{project_id}/members",
    response_model=PageResponse[ProjectMemberSummary],
)
def list_project_members(
    project_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_project_reader),
):
    project_access_or_404(db, project_id, user)
    cur_page = page if isinstance(page, int) and page >= 1 else 1
    cur_page_size = page_size if isinstance(page_size, int) and page_size >= 1 else 25
    all_members = project_members(db, project_id)
    total = len(all_members)
    start = (cur_page - 1) * cur_page_size
    items = all_members[start : start + cur_page_size]
    return {
        "items": items,
        "total": total,
        "page": cur_page,
        "page_size": cur_page_size,
    }


@router.post(
    "/{project_id}/members",
    response_model=list[ProjectMemberSummary],
)
def assign_project_team(
    project_id: int,
    payload: ProjectMembersAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = project_access_or_404(db, project_id, current_user)
    if current_user.role not in ("admin", "manager") and project.manager_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage this project's team.",
        )

    unique_user_ids = list(dict.fromkeys(payload.user_ids))
    target_users = (
        db.query(User)
        .filter(User.id.in_(unique_user_ids), User.status == "active")
        .all()
    )
    if len(target_users) != len(unique_user_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more specified users do not exist or are inactive.",
        )

    existing_members = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id)
        .all()
    )
    existing_user_ids = {m.user_id for m in existing_members}

    for u in target_users:
        if u.id not in existing_user_ids:
            db.add(ProjectMember(project_id=project_id, user_id=u.id))
            existing_user_ids.add(u.id)

    try:
        db.commit()
    except Exception:
        db.rollback()

    return project_members(db, project_id)


# ==========================================
# Project Documents Endpoints
# ==========================================

def _save_uploaded_file(file: UploadFile, project_id: int) -> tuple[str, str, int, str]:
    original_filename = file.filename or "unnamed_document"
    ext = Path(original_filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File extension '{ext}' is not permitted. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Sanitize filename
    clean_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", Path(original_filename).name)
    unique_name = f"{uuid.uuid4().hex}_{clean_name}"
    project_folder = UPLOAD_BASE_DIR / str(project_id)
    project_folder.mkdir(parents=True, exist_ok=True)
    destination = project_folder / unique_name

    bytes_written = 0
    try:
        with destination.open("wb") as buffer:
            while chunk := file.file.read(1024 * 64):
                bytes_written += len(chunk)
                if bytes_written > MAX_FILE_SIZE:
                    buffer.close()
                    if destination.exists():
                        destination.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="File exceeds maximum allowed size of 25MB.",
                    )
                buffer.write(chunk)
    except Exception as exc:
        if destination.exists():
            destination.unlink(missing_ok=True)
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save file to disk.",
        ) from exc

    relative_path = f"{project_id}/{unique_name}"
    content_type = file.content_type or "application/octet-stream"
    return original_filename, relative_path, bytes_written, content_type


@router.post(
    "/{project_id}/documents",
    response_model=ProjectDocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
def upload_project_document(
    project_id: int,
    file: UploadFile = File(...),
    title: str = Form(...),
    description: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project_editor_access_or_404(db, project_id, current_user)

    clean_title = title.strip()
    if not clean_title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Document title is required.",
        )

    original_filename, relative_path, file_size, content_type = _save_uploaded_file(file, project_id)

    doc = ProjectDocument(
        project_id=project_id,
        title=clean_title,
        description=description.strip() if isinstance(description, str) and description.strip() else None,
        file_name=original_filename,
        file_path=relative_path,
        file_size=file_size,
        content_type=content_type,
        uploaded_by_id=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{project_id}/documents/{document_id}/download")
def download_project_document(
    project_id: int,
    document_id: int,
    inline: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project_access_or_404(db, project_id, current_user)

    doc = (
        db.query(ProjectDocument)
        .filter_by(id=document_id, project_id=project_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    full_path = (UPLOAD_BASE_DIR / doc.file_path).resolve()
    # Path traversal protection
    if not str(full_path).startswith(str(UPLOAD_BASE_DIR)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    if not full_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The document file was not found on the server storage.",
        )

    disposition = "inline" if inline else "attachment"
    return FileResponse(
        path=full_path,
        filename=doc.file_name,
        media_type=doc.content_type or "application/octet-stream",
        content_disposition_type=disposition,
    )


@router.patch(
    "/{project_id}/documents/{document_id}",
    response_model=ProjectDocumentResponse,
)
def update_project_document(
    project_id: int,
    document_id: int,
    payload: ProjectDocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project_editor_access_or_404(db, project_id, current_user)

    doc = (
        db.query(ProjectDocument)
        .filter_by(id=document_id, project_id=project_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    if payload.title is not None:
        clean = payload.title.strip()
        if not clean:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Title cannot be empty.",
            )
        doc.title = clean

    if payload.description is not None:
        doc.description = payload.description.strip() if payload.description else None

    db.commit()
    db.refresh(doc)
    return doc


@router.post(
    "/{project_id}/documents/{document_id}/replace",
    response_model=ProjectDocumentResponse,
)
def replace_project_document(
    project_id: int,
    document_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project_editor_access_or_404(db, project_id, current_user)

    doc = (
        db.query(ProjectDocument)
        .filter_by(id=document_id, project_id=project_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    # Save new file
    original_filename, relative_path, file_size, content_type = _save_uploaded_file(file, project_id)

    # Delete old file from disk
    old_full_path = (UPLOAD_BASE_DIR / doc.file_path).resolve()
    if str(old_full_path).startswith(str(UPLOAD_BASE_DIR)) and old_full_path.exists():
        old_full_path.unlink(missing_ok=True)

    doc.file_name = original_filename
    doc.file_path = relative_path
    doc.file_size = file_size
    doc.content_type = content_type
    doc.uploaded_by_id = current_user.id

    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{project_id}/documents/{document_id}")
def delete_project_document(
    project_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project_editor_access_or_404(db, project_id, current_user)

    doc = (
        db.query(ProjectDocument)
        .filter_by(id=document_id, project_id=project_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    # Remove file from disk
    full_path = (UPLOAD_BASE_DIR / doc.file_path).resolve()
    if str(full_path).startswith(str(UPLOAD_BASE_DIR)) and full_path.exists():
        full_path.unlink(missing_ok=True)

    db.delete(doc)
    db.commit()
    return {"detail": "Document deleted successfully."}


# ==========================================
# Project Links Endpoints
# ==========================================

@router.post(
    "/{project_id}/links",
    response_model=ProjectLinkResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_project_link(
    project_id: int,
    payload: ProjectLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project_editor_access_or_404(db, project_id, current_user)

    clean_title = payload.title.strip()
    if not clean_title:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Link title is required.",
        )

    clean_url = validate_url_str(payload.url)

    link = ProjectLink(
        project_id=project_id,
        title=clean_title,
        url=clean_url,
        description=payload.description.strip() if payload.description else None,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.patch(
    "/{project_id}/links/{link_id}",
    response_model=ProjectLinkResponse,
)
def update_project_link(
    project_id: int,
    link_id: int,
    payload: ProjectLinkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project_editor_access_or_404(db, project_id, current_user)

    link = (
        db.query(ProjectLink)
        .filter_by(id=link_id, project_id=project_id)
        .first()
    )
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project link not found.")

    if payload.title is not None:
        clean = payload.title.strip()
        if not clean:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Link title cannot be empty.",
            )
        link.title = clean

    if payload.url is not None:
        link.url = validate_url_str(payload.url)

    if payload.description is not None:
        link.description = payload.description.strip() if payload.description else None

    db.commit()
    db.refresh(link)
    return link


@router.delete("/{project_id}/links/{link_id}")
def delete_project_link(
    project_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_project_reader),
):
    project_editor_access_or_404(db, project_id, current_user)

    link = (
        db.query(ProjectLink)
        .filter_by(id=link_id, project_id=project_id)
        .first()
    )
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project link not found.")

    db.delete(link)
    db.commit()
    return {"detail": "Project link deleted successfully."}
