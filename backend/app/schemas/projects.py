from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.project import ProjectDepartment, ProjectStatus
from app.models.staff_profile import StaffCategory


class ProjectManagerSummary(BaseModel):
    id: int
    full_name: str
    email: str


class ProjectMemberSummary(BaseModel):
    id: int
    full_name: str | None
    email: str
    role: str
    status: str
    staff_category: StaffCategory | None = None
    employee_id: str | None = None
    intern_id: str | None = None
    mobile: str | None = None
    department: str | None = None
    company_unit: str | None = None
    avatar_url: str | None = None


class ProjectDocumentResponse(BaseModel):
    id: int
    project_id: int
    title: str
    description: str | None = None
    file_name: str
    file_size: int
    content_type: str | None = None
    uploaded_by_id: int | None = None
    created_at: datetime
    updated_at: datetime


class ProjectDocumentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class ProjectLinkResponse(BaseModel):
    id: int
    project_id: int
    title: str
    url: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class ProjectLinkCreate(BaseModel):
    title: str
    url: str
    description: str | None = None


class ProjectLinkUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    description: str | None = None


class ProjectListItem(BaseModel):
    id: int
    name: str
    description: str | None = None
    client_name: str | None = None
    department: ProjectDepartment
    start_date: date
    end_date: date
    duration_days: int = Field(ge=0)
    completion_percent: float = Field(ge=0, le=100)
    tasks_total: int = Field(ge=0)
    tasks_completed: int = Field(ge=0)
    status: ProjectStatus
    member_categories: list[StaffCategory] = []
    manager: ProjectManagerSummary | None = None
    members: list[ProjectMemberSummary] = []


class ProjectDetails(ProjectListItem):
    documents: list[ProjectDocumentResponse] = []
    links: list[ProjectLinkResponse] = []


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    client_name: str | None = Field(default=None, max_length=200)
    department: ProjectDepartment
    start_date: date
    end_date: date
    status: ProjectStatus = ProjectStatus.NOT_STARTED
    manager_id: int | None = None
    member_ids: list[int] = []
    links: list[ProjectLinkCreate] = []


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    client_name: str | None = Field(default=None, max_length=200)
    department: ProjectDepartment | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: ProjectStatus | None = None
    manager_id: int | None = None
    member_ids: list[int] | None = None


class ProjectMembersAssignRequest(BaseModel):
    user_ids: list[int]


class ProjectFilters(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(default=None, max_length=200)
    status: ProjectStatus | None = None
    department: ProjectDepartment | None = None
    date_from: date | None = None
    date_to: date | None = None


ProjectCategory = Literal["Employee", "Intern", "Vendor"]


class StaffListItem(ProjectMemberSummary):
    invitation_status: str | None = None
    invitation_sent_at: datetime | None = None
    registration_completed_at: datetime | None = None
    can_manage_status: bool = False
    can_resend_invitation: bool = False
    profile_status: str | None = None
    staff_id: str | None = None


class EducationDetails(BaseModel):
    id: int
    institution: str | None = None
    qualification: str | None = None
    field_of_study: str | None = None
    start_date: date | None = None
    end_date: date | None = None


class AssignedProjectSummary(BaseModel):
    id: int
    name: str
    department: ProjectDepartment
    status: ProjectStatus


class StaffProfileDetails(StaffListItem):
    joining_date: date | None = None
    skills: list[str] | None = None
    reporting_manager: ProjectManagerSummary | None = None
    education: list[EducationDetails]
    assigned_projects: list[AssignedProjectSummary]
