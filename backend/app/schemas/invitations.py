from typing import Literal

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


InvitationRole = Literal["employee", "intern", "team_lead", "manager"]
AllInvitationRole = Literal["admin", "manager", "team_lead", "employee", "intern"]
InvitationStatus = Literal[
    "Invitation Pending",
    "Expired",
    "Registration Completed",
    "Not sent",
]


class AdminInvitationCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    full_name: str | None = Field(default=None, max_length=150)
    email: EmailStr = Field(max_length=255)
    role: InvitationRole
    department: str | None = Field(default="Ingage", max_length=120)
    employee_id: str | None = Field(default=None, max_length=80)
    temporary_password: str | None = Field(default=None, max_length=256)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("full_name", "department", "employee_id")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned if cleaned else None


class UserInvitationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=255)
    role: InvitationRole
    full_name: str | None = Field(default=None, max_length=150)
    department: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("full_name", "department")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None


class AdminInvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    role: str
    status: str
    full_name: str | None = None
    department: str | None = None
    staff_id: str | None = None
    setup_link: str | None = None
    email_sent: bool = True
    message: str | None = None
    sent_at: datetime | None = None
    expires_at: datetime | None = None
    completed_at: datetime | None = None



class InvitationValidateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=16, max_length=128)

    @field_validator("token")
    @classmethod
    def strip_token(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Token cannot be empty")
        return value


class InvitationValidateResponse(BaseModel):
    valid: bool
    email: EmailStr
    role: str


class InvitationRegistration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=16, max_length=128)
    full_name: str | None = Field(default="", max_length=150)
    password: str = Field(min_length=12, max_length=256)
    password_confirmation: str | None = Field(default=None, max_length=256)
    department: str | None = Field(default=None, max_length=120)
    mobile: str | None = Field(default=None, max_length=40)

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str | None) -> str:
        return value.strip() if value else ""

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot be blank")
        return value

    @field_validator("department", "mobile")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None


class InvitationRegistrationResponse(BaseModel):
    id: int
    full_name: str | None = ""
    email: EmailStr
    role: str
    status: str
    profile_status: str = "incomplete"
    registration_completed_at: datetime
