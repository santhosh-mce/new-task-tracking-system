from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


BreakType = Literal["Lunch", "Tea", "Personal", "Short Break"]
AttendanceStatus = Literal["Present", "Late", "Absent", "Not Checked In", "On Break", "Half Day", "On Leave"]
CorrectionStatus = Literal["Pending", "Approved", "Rejected"]


class CheckInRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str = Field(default="manual", max_length=30)
    notes: str | None = Field(default=None, max_length=255)


class CheckOutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notes: str | None = Field(default=None, max_length=255)


class BreakStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    break_type: BreakType = "Lunch"
    reason: str | None = Field(default=None, max_length=255)


class BreakEndRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AttendanceSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    check_in: datetime
    check_out: datetime | None = None
    duration_minutes: int | None = None
    source: str = "manual"


class AttendanceBreakResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    break_type: str
    start_time: datetime
    end_time: datetime | None = None
    duration_minutes: int | None = None
    is_deducted: bool = True
    reason: str | None = None


class AttendancePolicyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_name: str
    shift_start_time: str
    grace_period_minutes: int
    expected_daily_hours: float
    cutoff_time: str
    timezone: str
    deduct_lunch_break: bool
    deduct_tea_break: bool
    deduct_personal_break: bool
    deduct_short_break: bool
    max_break_minutes: int


class AttendancePolicyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shift_start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}(:\d{2})?$")
    grace_period_minutes: int | None = Field(default=None, ge=0, le=120)
    expected_daily_hours: float | None = Field(default=None, ge=1.0, le=24.0)
    cutoff_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}(:\d{2})?$")
    deduct_lunch_break: bool | None = None
    deduct_tea_break: bool | None = None
    deduct_personal_break: bool | None = None
    deduct_short_break: bool | None = None
    max_break_minutes: int | None = Field(default=None, ge=0, le=240)


class TodayAttendanceStatus(BaseModel):
    date: date
    status: str
    is_checked_in: bool
    is_on_break: bool
    active_session_id: int | None = None
    active_session_start: datetime | None = None
    active_break_id: int | None = None
    active_break_type: str | None = None
    active_break_start: datetime | None = None
    first_check_in: datetime | None = None
    last_check_out: datetime | None = None
    completed_work_minutes: int = 0
    total_break_minutes: int = 0
    net_work_minutes: int = 0
    server_time: datetime
    sessions: list[AttendanceSessionResponse] = []
    breaks: list[AttendanceBreakResponse] = []
    policy: AttendancePolicyResponse | None = None


class AttendanceRecordItem(BaseModel):
    id: int | None = None
    user_id: int
    full_name: str
    email: str
    role: str
    department: str | None = None
    date: date
    status: str
    first_check_in: datetime | None = None
    last_check_out: datetime | None = None
    sessions_count: int = 0
    total_work_minutes: int = 0
    total_break_minutes: int = 0
    net_work_minutes: int = 0
    is_on_break: bool = False
    is_checked_in: bool = False
    active_break_type: str | None = None


class AttendanceSummaryCounts(BaseModel):
    date: date
    total_staff: int
    present_count: int
    late_count: int
    on_break_count: int
    not_checked_in_count: int
    absent_count: int
    on_leave_count: int
    cutoff_passed: bool


class MonthlyStaffAttendanceSummary(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    department: str | None = None
    total_working_days: int
    present_days: int
    late_days: int
    absent_days: int
    leave_days: int
    total_net_work_hours: float
    avg_daily_hours: float


class CorrectionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_date: date
    requested_check_in: datetime
    requested_check_out: datetime
    requested_break_minutes: int = Field(default=0, ge=0, le=480)
    reason: str = Field(min_length=5, max_length=500)

    @field_validator("requested_check_out")
    @classmethod
    def validate_times(cls, v: datetime, info):
        check_in = info.data.get("requested_check_in")
        if check_in and v <= check_in:
            raise ValueError("Requested check-out time must be after check-in time.")
        return v


class CorrectionReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["approve", "reject"]
    reviewer_remarks: str = Field(min_length=2, max_length=500)


class CorrectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    full_name: str
    email: str
    request_date: date
    requested_check_in: datetime
    requested_check_out: datetime
    requested_break_minutes: int = 0
    reason: str
    status: str
    reviewed_by_id: int | None = None
    reviewer_name: str | None = None
    reviewer_remarks: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime


class RecentLoginStaffItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    user_id: int
    full_name: str
    email: str
    role: str
    staff_id: str | None = None
    department: str | None = "Ingage"
    profile_photo: str | None = None
    last_login: datetime | None = None
    login_status: str  # "Online", "On Break", "Offline", "Never Logged In"
    current_status: str = "Offline"
    session_duration_seconds: int = 0
    break_duration_seconds: int = 0
    working_duration_seconds: int = 0
    last_activity: datetime | None = None
    is_active_session: bool = False
    is_on_break: bool = False
    active_break_start: datetime | None = None
    source: str | None = None
