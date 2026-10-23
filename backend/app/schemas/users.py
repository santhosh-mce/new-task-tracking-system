from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


UserStatus = Literal["active", "inactive"]
UserRole = Literal["employee", "intern", "team_lead", "manager"]


class UserStatusUpdate(BaseModel):
    status: UserStatus


class UserRoleUpdate(BaseModel):
    role: UserRole


class AdminUserProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    department: str | None = Field(default=None, max_length=120)
    staff_id: str | None = Field(default=None, max_length=80)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str | None = None
    email: str
    role: str
    status: str
    must_change_password: bool = False
    onboarding_status: str = "completed"
    profile_status: str = "complete"


class UserProfileComplete(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    mobile: str = Field(min_length=5, max_length=40)
    profile_photo: str | None = Field(default=None, max_length=500)
    dob: str | None = None
    gender: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=500)
    city: str | None = Field(default=None, max_length=100)
    highest_qualification: str | None = Field(default=None, max_length=150)
    institution: str | None = Field(default=None, max_length=200)
    degree: str | None = Field(default=None, max_length=200)
    graduation_year: int | None = None
    skills: list[str] | str | None = None
    resume_url: str | None = Field(default=None, max_length=500)
    department: str | None = Field(default=None, max_length=120)
    designation: str | None = Field(default=None, max_length=120)
    joining_date: str | None = None
    reporting_manager_id: int | None = None
    work_location: str | None = Field(default=None, max_length=120)
