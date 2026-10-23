from datetime import date
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class EducationRecordItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    highest_qualification: str | None = None
    institution: str | None = None
    university: str | None = None
    degree: str | None = None
    field_of_study: str | None = None
    status: Literal["Pursuing", "Completed"] | str = "Completed"
    admission_year: int | None = None
    passing_year: int | None = None
    score: str | None = None  # CGPA or percentage


class LanguageItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    proficiency: Literal["Basic", "Intermediate", "Fluent", "Native"] | str = "Fluent"


class CertificationItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    issuer: str
    year: str | int | None = None
    issue_date: str | None = None
    credential_id: str | None = None
    certificate_url: str | None = None
    certificate_file: str | None = None


class ExperienceItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    company: str
    title: str
    employment_type: str | None = "Full-time"
    start_date: str | None = None
    end_date: str | None = None
    currently_working: bool = False
    description: str | None = None


class PortfolioProjectItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    description: str | None = None
    technologies: str | None = None
    github_url: str | None = None
    live_demo_url: str | None = None
    start_date: str | None = None
    end_date: str | None = None


class ProfessionalLinks(BaseModel):
    model_config = ConfigDict(extra="ignore")
    linkedin: str | None = None
    github: str | None = None
    portfolio: str | None = None


class ProfileCompletionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Personal fields
    full_name: str = Field(min_length=1, max_length=150)
    mobile: str = Field(min_length=7, max_length=40)
    profile_photo: str | None = Field(default=None, max_length=500000)
    dob: date | None = None
    gender: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)

    # Legacy / Primary Education fields
    highest_qualification: str | None = Field(default=None, max_length=150)
    institution: str | None = Field(default=None, max_length=200)
    degree: str | None = Field(default=None, max_length=200)
    graduation_year: int | None = Field(default=None, ge=1950, le=2100)

    # Multi-entry sections
    education_records: list[EducationRecordItem] | None = None
    skills: list[str] | None = None  # Technical Skills
    soft_skills: list[str] | None = None  # Soft Skills
    languages: list[LanguageItem] | None = None
    certifications: list[CertificationItem] | None = None
    work_experience: list[ExperienceItem] | None = None
    projects: list[PortfolioProjectItem] | None = None
    professional_links: ProfessionalLinks | dict[str, Any] | None = None
    resume_url: str | None = Field(default=None, max_length=500000)

    # Work fields
    department: Literal["Ingage", "Rezov", "Edutech"] | None = None
    designation: str | None = Field(default=None, max_length=120)
    joining_date: date | None = None
    reporting_manager_id: int | None = None
    work_location: str | None = Field(default=None, max_length=120)

    @field_validator("full_name", "mobile")
    @classmethod
    def validate_required_strings(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty")
        return s

    @field_validator("gender", "address", "city", "state", "country", "institution", "degree", "work_location", "designation")
    @classmethod
    def sanitize_optional_strings(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None


class ManagerOption(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    department: str | None = None


class AssignedProjectItem(BaseModel):
    id: int
    name: str
    department: str
    status: str


class MyProfileResponse(BaseModel):
    id: int
    email: str
    role: str
    status: str
    profile_status: str
    staff_id: str | None = None

    # Personal
    full_name: str
    mobile: str | None = None
    profile_photo: str | None = None
    dob: date | None = None
    gender: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None

    # Education
    highest_qualification: str | None = None
    institution: str | None = None
    degree: str | None = None
    graduation_year: int | None = None
    education_records: list[dict[str, Any]] | list[EducationRecordItem] = []

    # Skills & Languages
    skills: list[str] = []
    soft_skills: list[str] = []
    languages: list[dict[str, Any]] | list[LanguageItem] = []

    # Certifications & Experiences
    certifications: list[dict[str, Any]] | list[CertificationItem] = []
    work_experience: list[dict[str, Any]] | list[ExperienceItem] = []

    # Projects & Links
    projects: list[dict[str, Any]] | list[PortfolioProjectItem] = []
    professional_links: dict[str, Any] = {}
    resume_url: str | None = None

    # Work
    department: str | None = None
    designation: str | None = None
    joining_date: date | None = None
    reporting_manager_id: int | None = None
    reporting_manager_name: str | None = None
    work_location: str | None = None
    assigned_projects: list[AssignedProjectItem] = []

    # Metadata & Completion
    profile_completion_percentage: int = 0
    available_managers: list[ManagerOption] = []
    available_departments: list[str] = ["Ingage", "Rezov", "Edutech"]
