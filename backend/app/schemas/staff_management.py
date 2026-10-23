from datetime import date, datetime
from typing import Any, List, Optional
from pydantic import BaseModel, EmailStr, Field


class SimpleProjectSummary(BaseModel):
    id: int
    name: str
    department: Optional[str] = None
    status: Optional[str] = None


class SimpleTaskSummary(BaseModel):
    id: int
    title: str
    priority: str
    status: str
    progress: int
    due_date: Optional[date] = None
    project_id: Optional[int] = None
    project_name: Optional[str] = None


class SimpleAttendanceSummary(BaseModel):
    status: str
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    work_minutes: Optional[int] = 0
    break_minutes: Optional[int] = 0


class AttendanceHistoryItem(BaseModel):
    id: int
    date: date
    status: str
    first_check_in: Optional[datetime] = None
    last_check_out: Optional[datetime] = None
    net_work_minutes: int
    total_break_minutes: int


class MentorSummary(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str
    department: Optional[str] = None


# --- Employee Schemas ---

class EmployeeStats(BaseModel):
    total_employees: int
    active_employees: int
    inactive_employees: int
    present_today: int
    departments: List[dict] = []


class EmployeeSummaryItem(BaseModel):
    id: int
    employee_id: Optional[str] = None
    full_name: Optional[str] = None
    email: str
    profile_photo: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    joining_date: Optional[date] = None
    status: str
    assigned_projects: List[SimpleProjectSummary] = []
    today_attendance: SimpleAttendanceSummary
    tasks_count: int = 0


class EmployeeDetails(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str
    role: str
    status: str
    employee_id: Optional[str] = None
    mobile: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    joining_date: Optional[date] = None
    work_location: Optional[str] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    skills: Optional[List[str]] = None
    highest_qualification: Optional[str] = None
    institution: Optional[str] = None
    degree: Optional[str] = None
    graduation_year: Optional[int] = None
    resume_url: Optional[str] = None
    reporting_manager: Optional[MentorSummary] = None
    assigned_projects: List[SimpleProjectSummary] = []
    tasks: List[SimpleTaskSummary] = []
    attendance_history: List[AttendanceHistoryItem] = []
    total_tasks: int = 0
    completed_tasks: int = 0
    task_completion_rate: float = 0.0


class EmployeeCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)
    department: Optional[str] = "Ingage"
    designation: Optional[str] = "Software Engineer"
    joining_date: Optional[str] = None
    mobile: Optional[str] = None
    work_location: Optional[str] = None
    reporting_manager_id: Optional[int] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    joining_date: Optional[str] = None
    work_location: Optional[str] = None
    reporting_manager_id: Optional[int] = None
    skills: Optional[Any] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    highest_qualification: Optional[str] = None
    institution: Optional[str] = None
    degree: Optional[str] = None
    graduation_year: Optional[int] = None


# --- Intern Schemas ---

class InternStats(BaseModel):
    total_interns: int
    active_interns: int
    completed_interns: int
    inactive_interns: int
    ending_soon: int


class InternSummaryItem(BaseModel):
    id: int
    intern_id: Optional[str] = None
    full_name: Optional[str] = None
    email: str
    profile_photo: Optional[str] = None
    college: Optional[str] = None
    department: Optional[str] = None
    mentor: Optional[MentorSummary] = None
    assigned_projects: List[SimpleProjectSummary] = []
    internship_start_date: Optional[date] = None
    internship_end_date: Optional[date] = None
    duration_weeks: Optional[int] = None
    is_ending_soon: bool = False
    days_remaining: Optional[int] = None
    task_completion_progress: int = 0
    tasks_count: int = 0
    completed_tasks_count: int = 0
    internship_status: str = "Active"
    account_status: str = "active"
    today_attendance: SimpleAttendanceSummary


class InternDetails(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str
    role: str
    status: str
    intern_id: Optional[str] = None
    mobile: Optional[str] = None
    college: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = "Intern"
    internship_start_date: Optional[date] = None
    internship_end_date: Optional[date] = None
    duration_weeks: Optional[int] = None
    is_ending_soon: bool = False
    days_remaining: Optional[int] = None
    work_location: Optional[str] = None
    skills: Optional[List[str]] = None
    internship_status: str = "Active"
    mentor: Optional[MentorSummary] = None
    assigned_projects: List[SimpleProjectSummary] = []
    tasks: List[SimpleTaskSummary] = []
    attendance_history: List[AttendanceHistoryItem] = []
    total_tasks: int = 0
    completed_tasks: int = 0
    task_completion_progress: int = 0


class InternCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1)
    college: Optional[str] = None
    department: Optional[str] = "Ingage"
    mentor_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    mobile: Optional[str] = None
    work_location: Optional[str] = None


class InternUpdate(BaseModel):
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    college: Optional[str] = None
    department: Optional[str] = None
    mentor_id: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    work_location: Optional[str] = None
    skills: Optional[Any] = None
    internship_status: Optional[str] = None
    degree: Optional[str] = None
    graduation_year: Optional[int] = None
