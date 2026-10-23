from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


TaskPriority = Literal["Low", "Medium", "High", "Urgent"]
TaskStatus = Literal[
    "Assigned",
    "In Progress",
    "Submitted for Review",
    "Changes Requested",
    "Completed",
]
AssignmentType = Literal["Individual", "Group"]


class TaskUserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    role: str


class TaskAssigneeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    role: str
    staff_category: str | None = None
    department: str | None = None
    company_unit: str | None = None
    avatar_url: str | None = None


class TaskProjectSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    department: str
    status: str


class TaskActivityItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    comment: str | None = None
    created_at: datetime
    user: TaskUserSummary


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None = None
    project_id: int | None = None
    project: TaskProjectSummary | None = None
    assigned_by: TaskUserSummary | None = None
    assignment_type: str
    priority: str
    start_date: date | None = None
    due_date: date | None = None
    estimated_hours: float | None = None
    progress: int = 0
    status: str
    submission_notes: str | None = None
    review_comments: str | None = None
    created_at: datetime
    updated_at: datetime
    assignees: list[TaskAssigneeSummary] = []
    activities: list[TaskActivityItem] = []


class PersonalTaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    planned_start: date
    planned_end: date

    @model_validator(mode="after")
    def validate_dates(self):
        if self.planned_end < self.planned_start:
            raise ValueError("Planned End cannot be earlier than Planned Start.")
        return self


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    project_id: int | None = None
    assignee_ids: list[int] = Field(default_factory=list)
    assignment_type: AssignmentType = "Individual"
    priority: TaskPriority = "Medium"
    start_date: date | None = None
    due_date: date
    estimated_hours: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_dates_and_assignment(self):
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("Due date cannot be earlier than start date.")
        if len(self.assignee_ids) > 1 and self.assignment_type == "Individual":
            self.assignment_type = "Group"
        return self


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    project_id: int | None = None
    assignee_ids: list[int] | None = None
    priority: TaskPriority | None = None
    start_date: date | None = None
    due_date: date | None = None
    estimated_hours: float | None = Field(default=None, ge=0)
    progress: int | None = Field(default=None, ge=0, le=100)
    status: TaskStatus | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.due_date and self.due_date < self.start_date:
            raise ValueError("Due date cannot be earlier than start date.")
        return self


class TaskAssignRequest(BaseModel):
    assignee_ids: list[int] = Field(min_length=1)
    assignment_type: AssignmentType = "Individual"

    @model_validator(mode="after")
    def auto_adjust_assignment_type(self):
        if len(self.assignee_ids) > 1:
            self.assignment_type = "Group"
        return self


class TaskProgressUpdate(BaseModel):
    progress: int = Field(ge=0, le=100)
    status: TaskStatus | None = None
    comment: str | None = None


class TaskSubmitReview(BaseModel):
    submission_notes: str | None = None


class TaskReviewAction(BaseModel):
    action: Literal["approve", "request_changes"]
    comment: str | None = None


class TaskSummaryCounts(BaseModel):
    total_tasks: int
    in_progress: int
    pending_review: int
    completed: int
    overdue_tasks: int


class DailyWorkUpdateCreate(BaseModel):
    project_id: int | None = None
    task_id: int | None = None
    update_date: date | None = None
    work_description: str = Field(min_length=1)
    work_status: str = Field(default="In Progress")
    progress_percentage: int = Field(default=0, ge=0, le=100)
    blockers: str | None = None
    tomorrow_plan: str | None = None
    attachment_url: str | None = None
    live_link: str | None = None
    remarks: str | None = None


class DailyWorkUpdateTaskInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    status: str
    priority: str
    progress: int = 0


class DailyWorkUpdateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    project_id: int | None = None
    task_id: int | None = None
    update_date: date
    work_description: str
    work_status: str
    progress_percentage: int
    blockers: str | None = None
    tomorrow_plan: str | None = None
    attachment_url: str | None = None
    live_link: str | None = None
    remarks: str | None = None
    created_at: datetime
    updated_at: datetime
    user: TaskUserSummary | None = None
    project: TaskProjectSummary | None = None
    task: DailyWorkUpdateTaskInfo | None = None

