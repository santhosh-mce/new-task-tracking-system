import unittest
from datetime import date, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException

from app.database import Base
from app.models.user import User
from app.models.staff_profile import StaffProfile, StaffCategory
from app.models.project import Project, ProjectMember, ProjectDepartment, ProjectStatus
from app.models.task import Task, TaskAssignment, TaskActivity, Notification
from app.routers.tasks import (
    create_task,
    create_personal_task,
    list_tasks,
    get_task_details,
    update_task,
    assign_task,
    update_task_progress,
    submit_task_for_review,
    review_task,
    get_task_summary,
    get_assignable_users,
    build_task_response,
    delete_task,
)
from app.schemas.tasks import (
    TaskCreate,
    PersonalTaskCreate,
    TaskUpdate,
    TaskAssignRequest,
    TaskProgressUpdate,
    TaskSubmitReview,
    TaskReviewAction,
)
from app.routers.projects import get_project


class TasksWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.Session()

        # Users
        self.admin = User(
            id=1,
            full_name="Admin User",
            email="admin@test.com",
            role="admin",
            status="active",
        )
        self.manager = User(
            id=2,
            full_name="Manager Bob",
            email="manager@test.com",
            role="manager",
            status="active",
        )
        self.employee = User(
            id=3,
            full_name="Employee Alice",
            email="alice@test.com",
            role="employee",
            status="active",
        )
        self.intern = User(
            id=4,
            full_name="Intern Charlie",
            email="charlie@test.com",
            role="intern",
            status="active",
        )
        self.other_user = User(
            id=5,
            full_name="Other Employee",
            email="other@test.com",
            role="employee",
            status="active",
        )
        self.db.add_all([self.admin, self.manager, self.employee, self.intern, self.other_user])
        self.db.commit()

        # Profiles
        self.prof_employee = StaffProfile(
            user_id=self.employee.id,
            staff_category=StaffCategory.EMPLOYEE,
            department="Engineering",
        )
        self.prof_intern = StaffProfile(
            user_id=self.intern.id,
            staff_category=StaffCategory.INTERN,
            department="Product",
        )
        self.db.add_all([self.prof_employee, self.prof_intern])
        self.db.commit()

        # Project
        self.project = Project(
            id=1,
            name="Alpha TaskFlow",
            description="Alpha project",
            department=ProjectDepartment.INGAGE,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            status=ProjectStatus.IN_PROGRESS,
            manager_id=self.manager.id,
        )
        self.db.add(self.project)
        self.db.commit()

        # Project memberships: manager is manager_id, employee, intern, admin are members
        self.pm_admin = ProjectMember(project_id=self.project.id, user_id=self.admin.id)
        self.pm_employee = ProjectMember(project_id=self.project.id, user_id=self.employee.id)
        self.pm_intern = ProjectMember(project_id=self.project.id, user_id=self.intern.id)
        self.pm_manager = ProjectMember(project_id=self.project.id, user_id=self.manager.id)
        # Note: self.other_user is intentionally NOT a member of self.project
        self.db.add_all([self.pm_admin, self.pm_employee, self.pm_intern, self.pm_manager])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_task_and_summary_counts(self):
        # 1. Admin creates task
        create_payload = TaskCreate(
            title="Build Navigation Bar",
            description="Create responsive navigation with brand colors",
            project_id=self.project.id,
            assignee_ids=[self.employee.id],
            assignment_type="Individual",
            priority="High",
            start_date=date.today(),
            due_date=date.today() + timedelta(days=5),
            estimated_hours=8.0,
        )
        task_resp = create_task(payload=create_payload, db=self.db, current_user=self.admin)
        self.assertEqual(task_resp.title, "Build Navigation Bar")
        self.assertEqual(task_resp.status, "Assigned")
        self.assertEqual(task_resp.priority, "High")
        self.assertEqual(len(task_resp.assignees), 1)
        self.assertEqual(task_resp.assignees[0].id, self.employee.id)

        # 2. Check summary
        summary = get_task_summary(my_tasks=False, db=self.db, current_user=self.admin)
        self.assertEqual(summary.total_tasks, 1)
        self.assertEqual(summary.in_progress, 0)
        self.assertEqual(summary.completed, 0)
        self.assertEqual(summary.overdue_tasks, 0)

        # Check notifications generated for employee
        notifs = self.db.query(Notification).filter(Notification.user_id == self.employee.id).all()
        self.assertEqual(len(notifs), 1)
        self.assertIn("Build Navigation Bar", notifs[0].message)

    def test_reject_inactive_or_invalid_user_assignment(self):
        inactive_user = User(
            id=999,
            email="inactive@example.com",
            full_name="Inactive User",
            role="employee",
            status="inactive",
        )
        self.db.add(inactive_user)
        self.db.commit()

        payload = TaskCreate(
            title="Inactive Task Assignment",
            project_id=self.project.id,
            assignee_ids=[999],
            due_date=date.today() + timedelta(days=5),
        )
        with self.assertRaises(HTTPException) as ctx:
            create_task(payload=payload, db=self.db, current_user=self.admin)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("inactive", ctx.exception.detail.lower())

    def test_project_assignable_members_endpoint(self):
        from app.routers.tasks import get_project_assignable_members
        members = get_project_assignable_members(
            project_id=self.project.id,
            db=self.db,
            current_user=self.admin,
        )
        member_ids = [m["id"] for m in members]
        self.assertIn(self.employee.id, member_ids)
        self.assertIn(self.intern.id, member_ids)
        self.assertIn(self.manager.id, member_ids)
        # self.other_user is not a member of self.project
        self.assertNotIn(self.other_user.id, member_ids)

    def test_group_assignment(self):
        # Manager creates group task
        payload = TaskCreate(
            title="Team Code Review",
            project_id=self.project.id,
            assignee_ids=[self.employee.id, self.intern.id],
            assignment_type="Group",
            priority="Medium",
            start_date=date.today(),
            due_date=date.today() + timedelta(days=2),
        )
        task_resp = create_task(payload=payload, db=self.db, current_user=self.manager)
        self.assertEqual(task_resp.assignment_type, "Group")
        self.assertEqual(len(task_resp.assignees), 2)
        assignee_names = [a.full_name for a in task_resp.assignees]
        self.assertIn("Employee Alice", assignee_names)
        self.assertIn("Intern Charlie", assignee_names)

        # Reassigning to active user succeeds without project membership restriction
        reassigned = assign_task(
            task_id=task_resp.id,
            payload=TaskAssignRequest(assignee_ids=[self.other_user.id]),
            db=self.db,
            current_user=self.manager,
        )
        self.assertEqual(len(reassigned.assignees), 1)
        self.assertEqual(reassigned.assignees[0].id, self.other_user.id)

    def test_workflow_progress_review_approval(self):
        # Create task assigned to employee
        create_payload = TaskCreate(
            title="Database Optimization",
            project_id=self.project.id,
            assignee_ids=[self.employee.id],
            due_date=date.today() + timedelta(days=3),
        )
        task = create_task(payload=create_payload, db=self.db, current_user=self.admin)

        # Direct jump to Completed via progress must be rejected
        with self.assertRaises(HTTPException) as ctx:
            update_task_progress(
                task_id=task.id,
                payload=TaskProgressUpdate(progress=100, status="Completed"),
                db=self.db,
                current_user=self.employee,
            )
        self.assertEqual(ctx.exception.status_code, 400)

        # 1. Employee updates progress to 50% -> transitions to In Progress
        prog_payload = TaskProgressUpdate(progress=50, comment="Indexed key columns")
        updated = update_task_progress(
            task_id=task.id,
            payload=prog_payload,
            db=self.db,
            current_user=self.employee,
        )
        self.assertEqual(updated.progress, 50)
        self.assertEqual(updated.status, "In Progress")

        # 2. Employee submits for review
        sub_payload = TaskSubmitReview(submission_notes="Ready for review, queries now 10x faster.")
        submitted = submit_task_for_review(
            task_id=task.id,
            payload=sub_payload,
            db=self.db,
            current_user=self.employee,
        )
        self.assertEqual(submitted.status, "Submitted for Review")
        self.assertEqual(submitted.submission_notes, "Ready for review, queries now 10x faster.")

        # While submitted for review, employee cannot update progress
        with self.assertRaises(HTTPException) as ctx:
            update_task_progress(
                task_id=task.id,
                payload=TaskProgressUpdate(progress=80),
                db=self.db,
                current_user=self.employee,
            )
        self.assertEqual(ctx.exception.status_code, 400)

        # Summary shows 1 pending review
        summary = get_task_summary(my_tasks=False, db=self.db, current_user=self.admin)
        self.assertEqual(summary.pending_review, 1)

        # 3. Manager requests changes -> status becomes Changes Requested
        review_req = TaskReviewAction(action="request_changes", comment="Please add benchmark report.")
        changes_req = review_task(
            task_id=task.id,
            payload=review_req,
            db=self.db,
            current_user=self.manager,
        )
        self.assertEqual(changes_req.status, "Changes Requested")
        self.assertEqual(changes_req.review_comments, "Please add benchmark report.")

        # 4. Employee resumes rework by updating progress -> moves to In Progress
        rework_updated = update_task_progress(
            task_id=task.id,
            payload=TaskProgressUpdate(progress=90, comment="Running benchmark tests"),
            db=self.db,
            current_user=self.employee,
        )
        self.assertEqual(rework_updated.status, "In Progress")

        # 5. Employee resubmits for review
        sub_payload2 = TaskSubmitReview(submission_notes="Benchmark report attached.")
        resubmitted = submit_task_for_review(
            task_id=task.id,
            payload=sub_payload2,
            db=self.db,
            current_user=self.employee,
        )
        self.assertEqual(resubmitted.status, "Submitted for Review")

        # 6. Manager approves -> Completed, 100% progress
        approve_req = TaskReviewAction(action="approve", comment="Looks great! Approved.")
        approved = review_task(
            task_id=task.id,
            payload=approve_req,
            db=self.db,
            current_user=self.manager,
        )
        self.assertEqual(approved.status, "Completed")
        self.assertEqual(approved.progress, 100)

        # Completed task cannot be submitted for review
        with self.assertRaises(HTTPException) as ctx:
            submit_task_for_review(
                task_id=task.id,
                payload=TaskSubmitReview(submission_notes="Resubmission?"),
                db=self.db,
                current_user=self.employee,
            )
        self.assertEqual(ctx.exception.status_code, 400)

        # 7. Verify Project Completion % is updated to 100%
        proj_details = get_project(
            project_id=self.project.id,
            db=self.db,
            user=self.admin,
        )
        self.assertEqual(proj_details["completion_percent"], 100.0)
        self.assertEqual(proj_details["tasks_completed"], 1)
        self.assertEqual(proj_details["tasks_total"], 1)

    def test_rbac_and_my_tasks_scoping(self):
        # Create 2 tasks: one for admin, one for employee
        t1 = create_task(
            payload=TaskCreate(
                title="Admin Special Task",
                project_id=self.project.id,
                assignee_ids=[self.admin.id],
                due_date=date.today() + timedelta(days=1),
            ),
            db=self.db,
            current_user=self.admin,
        )
        t2 = create_task(
            payload=TaskCreate(
                title="Employee Task",
                project_id=self.project.id,
                assignee_ids=[self.employee.id],
                due_date=date.today() + timedelta(days=1),
            ),
            db=self.db,
            current_user=self.admin,
        )

        # Admin regular list sees all (2 tasks)
        admin_all = list_tasks(db=self.db, current_user=self.admin, my_tasks=False)
        self.assertEqual(admin_all.total, 2)

        # Admin "My Tasks" sees only 1 task (t1)
        admin_my = list_tasks(db=self.db, current_user=self.admin, my_tasks=True)
        self.assertEqual(admin_my.total, 1)
        self.assertEqual(admin_my.items[0].id, t1.id)

        # Employee regular list only sees their assigned task (t2)
        emp_list = list_tasks(db=self.db, current_user=self.employee, my_tasks=False)
        self.assertEqual(emp_list.total, 1)
        self.assertEqual(emp_list.items[0].id, t2.id)

        # Employee manipulated request passing user_id of Admin is still scoped strictly
        emp_manipulated = list_tasks(
            db=self.db,
            current_user=self.employee,
            user_id=self.admin.id,
            my_tasks=False,
        )
        self.assertEqual(emp_manipulated.total, 0)

        # Employee cannot access admin task directly
        with self.assertRaises(HTTPException) as ctx:
            get_task_details(task_id=t1.id, db=self.db, current_user=self.employee)
        self.assertEqual(ctx.exception.status_code, 404)

        # Non-assigned user cannot access t2
        with self.assertRaises(HTTPException) as ctx:
            get_task_details(task_id=t2.id, db=self.db, current_user=self.other_user)
        self.assertEqual(ctx.exception.status_code, 404)

    def test_create_personal_task_and_ownership(self):
        # Employee creates a personal daily task without a project
        payload = PersonalTaskCreate(
            title="Complete Daily Standup & Review PRs",
            description="Personal daily plan for sprint progress",
            planned_start=date.today(),
            planned_end=date.today() + timedelta(days=1),
        )
        task_resp = create_personal_task(
            payload=payload,
            db=self.db,
            current_user=self.employee,
        )
        self.assertEqual(task_resp.title, "Complete Daily Standup & Review PRs")
        self.assertIsNone(task_resp.project_id)
        self.assertIsNone(task_resp.project)
        self.assertEqual(task_resp.assigned_by.id, self.employee.id)

        # Check that it appears in Employee's My Tasks list
        emp_my = list_tasks(db=self.db, current_user=self.employee, my_tasks=True)
        my_ids = [t.id for t in emp_my.items]
        self.assertIn(task_resp.id, my_ids)

        # Check date validation: planned_end < planned_start raises 422
        with self.assertRaises(Exception):
            PersonalTaskCreate(
                title="Invalid Date Task",
                planned_start=date(2026, 5, 10),
                planned_end=date(2026, 5, 1),
            )

    def test_assign_task_role_and_active_user_validation(self):
        # Assigning non-member (other_user) to project with saved team is rejected
        payload = TaskCreate(
            title="Task with Active User",
            project_id=self.project.id,
            assignee_ids=[self.other_user.id],
            due_date=date.today() + timedelta(days=2),
        )
        with self.assertRaises(HTTPException) as ctx:
            create_task(payload=payload, db=self.db, current_user=self.admin)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not a member", ctx.exception.detail.lower())

        # Assigning authorized member (employee) succeeds
        valid_payload = TaskCreate(
            title="Task with Valid Member",
            project_id=self.project.id,
            assignee_ids=[self.employee.id],
            due_date=date.today() + timedelta(days=2),
        )
        valid_task = create_task(payload=valid_payload, db=self.db, current_user=self.admin)
        self.assertEqual(valid_task.title, "Task with Valid Member")
        self.assertEqual(valid_task.project_id, self.project.id)
        self.assertEqual(len(valid_task.assignees), 1)
        self.assertEqual(valid_task.assignees[0].id, self.employee.id)

        # Standalone task creation without project succeeds for admin
        standalone_payload = TaskCreate(
            title="Standalone Team Task",
            project_id=None,
            assignee_ids=[self.other_user.id],
            due_date=date.today() + timedelta(days=3),
        )
        standalone_task = create_task(payload=standalone_payload, db=self.db, current_user=self.admin)
        self.assertEqual(standalone_task.title, "Standalone Team Task")
        self.assertIsNone(standalone_task.project_id)
        self.assertEqual(standalone_task.assignees[0].id, self.other_user.id)

    def test_get_assignable_users_returns_active_users(self):
        # Admin querying assignable users without project gets all active users
        all_users = get_assignable_users(
            project_id=None,
            db=self.db,
            current_user=self.admin,
        )
        all_ids = {m["id"] for m in all_users}
        self.assertIn(self.employee.id, all_ids)
        self.assertIn(self.intern.id, all_ids)
        self.assertIn(self.other_user.id, all_ids)

        # Querying assignable users for a project with saved team returns that team
        proj_users = get_assignable_users(
            project_id=self.project.id,
            db=self.db,
            current_user=self.admin,
        )
        proj_ids = {m["id"] for m in proj_users}
        self.assertIn(self.employee.id, proj_ids)
        self.assertNotIn(self.other_user.id, proj_ids)

    def test_list_tasks_department_and_standalone_filter(self):
        # Second project with Rezov department
        project_rezov = Project(
            id=2,
            name="Rezov Portal",
            description="Rezov project",
            department=ProjectDepartment.REZOV,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            status=ProjectStatus.IN_PROGRESS,
            manager_id=self.manager.id,
        )
        self.db.add(project_rezov)
        self.db.commit()
        self.db.add(ProjectMember(project_id=project_rezov.id, user_id=self.employee.id))
        self.db.commit()

        # Create Ingage task
        t_ingage = create_task(
            payload=TaskCreate(
                title="Ingage Task",
                project_id=self.project.id,
                assignee_ids=[self.employee.id],
                due_date=date.today() + timedelta(days=2),
            ),
            db=self.db,
            current_user=self.admin,
        )

        # Create Rezov task
        t_rezov = create_task(
            payload=TaskCreate(
                title="Rezov Task",
                project_id=project_rezov.id,
                assignee_ids=[self.employee.id],
                due_date=date.today() + timedelta(days=2),
            ),
            db=self.db,
            current_user=self.admin,
        )

        # Create Standalone task
        t_standalone = create_task(
            payload=TaskCreate(
                title="Standalone Filter Task",
                project_id=None,
                assignee_ids=[self.employee.id],
                due_date=date.today() + timedelta(days=2),
            ),
            db=self.db,
            current_user=self.admin,
        )

        # Filter by department Ingage
        res_ingage = list_tasks(
            department="Ingage",
            db=self.db,
            current_user=self.admin,
        )
        ingage_ids = [t.id for t in res_ingage.items]
        self.assertIn(t_ingage.id, ingage_ids)
        self.assertNotIn(t_rezov.id, ingage_ids)
        self.assertNotIn(t_standalone.id, ingage_ids)

        # Filter by standalone
        res_standalone = list_tasks(
            standalone=True,
            db=self.db,
            current_user=self.admin,
        )
        standalone_ids = [t.id for t in res_standalone.items]
        self.assertIn(t_standalone.id, standalone_ids)
        self.assertNotIn(t_ingage.id, standalone_ids)
        self.assertNotIn(t_rezov.id, standalone_ids)

    def test_update_task_fields_and_assignees(self):
        # Create initial task assigned to employee
        task = create_task(
            payload=TaskCreate(
                title="Initial Task",
                description="Initial desc",
                project_id=self.project.id,
                assignee_ids=[self.employee.id],
                priority="Low",
                start_date=date.today(),
                due_date=date.today() + timedelta(days=5),
            ),
            db=self.db,
            current_user=self.admin,
        )

        # Update task: title, dates, priority, progress, status, and assignees (add intern)
        updated = update_task(
            task_id=task.id,
            payload=TaskUpdate(
                title="Updated Task Title",
                description="Updated desc",
                priority="Urgent",
                progress=50,
                status="In Progress",
                start_date=date.today() + timedelta(days=1),
                due_date=date.today() + timedelta(days=7),
                assignee_ids=[self.employee.id, self.intern.id],
            ),
            db=self.db,
            current_user=self.admin,
        )

        self.assertEqual(updated.title, "Updated Task Title")
        self.assertEqual(updated.description, "Updated desc")
        self.assertEqual(updated.priority, "Urgent")
        self.assertEqual(updated.progress, 50)
        self.assertEqual(updated.status, "In Progress")
        self.assertEqual(len(updated.assignees), 2)
        assignee_ids = {a.id for a in updated.assignees}
        self.assertEqual(assignee_ids, {self.employee.id, self.intern.id})
        self.assertEqual(updated.assignment_type, "Group")

    def test_update_task_active_user_succeeds(self):
        task = create_task(
            payload=TaskCreate(
                title="Project Task",
                project_id=self.project.id,
                assignee_ids=[self.employee.id],
                due_date=date.today() + timedelta(days=3),
            ),
            db=self.db,
            current_user=self.admin,
        )

        # Changing task assignees to another project team member (intern) succeeds
        updated = update_task(
            task_id=task.id,
            payload=TaskUpdate(
                assignee_ids=[self.intern.id],
            ),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(len(updated.assignees), 1)
        self.assertEqual(updated.assignees[0].id, self.intern.id)

        # Attempting to assign a non-member to the project task is rejected
        with self.assertRaises(HTTPException) as ctx:
            update_task(
                task_id=task.id,
                payload=TaskUpdate(
                    assignee_ids=[self.other_user.id],
                ),
                db=self.db,
                current_user=self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not a member", ctx.exception.detail.lower())

        # Project team in ProjectMember remains unchanged
        pm_count = self.db.query(ProjectMember).filter(ProjectMember.project_id == self.project.id).count()
        self.assertEqual(pm_count, 4)

    def test_update_task_invalid_dates_rejected(self):
        task = create_task(
            payload=TaskCreate(
                title="Date Task",
                project_id=self.project.id,
                assignee_ids=[self.employee.id],
                start_date=date.today(),
                due_date=date.today() + timedelta(days=3),
            ),
            db=self.db,
            current_user=self.admin,
        )

        # Attempt to set start_date after existing due_date
        with self.assertRaises(HTTPException) as ctx:
            update_task(
                task_id=task.id,
                payload=TaskUpdate(
                    start_date=date.today() + timedelta(days=10),
                ),
                db=self.db,
                current_user=self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Due date cannot be earlier than start date", ctx.exception.detail)

    def test_update_task_unauthorized_fails(self):
        task = create_task(
            payload=TaskCreate(
                title="Restricted Task",
                project_id=self.project.id,
                assignee_ids=[self.employee.id],
                due_date=date.today() + timedelta(days=3),
            ),
            db=self.db,
            current_user=self.admin,
        )

        # Employee (not admin or manager) tries to update task
        with self.assertRaises(HTTPException) as ctx:
            update_task(
                task_id=task.id,
                payload=TaskUpdate(title="Hacked Title"),
                db=self.db,
                current_user=self.employee,
            )
        self.assertEqual(ctx.exception.status_code, 403)

    def test_project_without_members_allows_assigning_authorized_users(self):
        from app.routers.tasks import get_project_assignable_members, get_assignable_users
        empty_project = Project(
            id=99,
            name="Empty Project",
            description="Project with no team members",
            department=ProjectDepartment.EDUTECH,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=60),
            status=ProjectStatus.NOT_STARTED,
            manager_id=self.manager.id,
        )
        self.db.add(empty_project)
        self.db.commit()

        # 1. get_project_assignable_members returns active users
        members = get_project_assignable_members(
            project_id=empty_project.id,
            db=self.db,
            current_user=self.admin,
        )
        self.assertTrue(len(members) > 0)

        # 2. get_assignable_users for this project returns active users
        assignable = get_assignable_users(
            project_id=empty_project.id,
            db=self.db,
            current_user=self.manager,
        )
        self.assertTrue(len(assignable) > 0)

        # 3. Assigning task to an active user on this project succeeds
        payload = TaskCreate(
            title="Project Task on Empty Project",
            project_id=empty_project.id,
            assignee_ids=[self.employee.id],
            priority="High",
            start_date=date.today(),
            due_date=date.today() + timedelta(days=5),
        )
        task = create_task(payload=payload, db=self.db, current_user=self.manager)
        self.assertEqual(task.title, "Project Task on Empty Project")
        self.assertEqual(task.project_id, empty_project.id)
        self.assertEqual(task.assignees[0].id, self.employee.id)

    def test_switching_projects_allows_authorized_users(self):
        from app.routers.tasks import get_project_assignable_members
        # Create Project B
        project_b = Project(
            id=102,
            name="Project Beta",
            description="Beta project",
            department=ProjectDepartment.REZOV,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=30),
            status=ProjectStatus.IN_PROGRESS,
            manager_id=self.manager.id,
        )
        self.db.add(project_b)
        self.db.commit()

        # 1. Project A members returns its saved team; Project B (empty) returns active users for initial team assignment
        members_a = get_project_assignable_members(project_id=self.project.id, db=self.db, current_user=self.admin)
        member_a_ids = {m["id"] for m in members_a}
        self.assertIn(self.employee.id, member_a_ids)
        self.assertNotIn(self.other_user.id, member_a_ids)
        emp_member = next(m for m in members_a if m["id"] == self.employee.id)
        self.assertEqual(emp_member["company_unit"], "Engineering")

        members_b = get_project_assignable_members(project_id=project_b.id, db=self.db, current_user=self.admin)
        member_b_ids = {m["id"] for m in members_b}
        self.assertIn(self.intern.id, member_b_ids)
        self.assertIn(self.employee.id, member_b_ids)
        self.assertIn(self.other_user.id, member_b_ids)

        # 2. Create task for Project A assigned to employee
        task = create_task(
            payload=TaskCreate(
                title="Frontend Redesign",
                project_id=self.project.id,
                assignee_ids=[self.employee.id],
                due_date=date.today() + timedelta(days=7),
            ),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(task.project_id, self.project.id)

        # 3. Editing task: assigning intern (authorized Project A team member) succeeds
        updated_assignee = update_task(
            task_id=task.id,
            payload=TaskUpdate(assignee_ids=[self.intern.id]),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual([a.id for a in updated_assignee.assignees], [self.intern.id])

        # 4. Editing task: assigning non-member to Project A is rejected
        with self.assertRaises(HTTPException) as ctx:
            update_task(
                task_id=task.id,
                payload=TaskUpdate(assignee_ids=[self.other_user.id]),
                db=self.db,
                current_user=self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 400)

        # 5. Editing task: switching project to project_b succeeds and allows other_user
        updated_proj = update_task(
            task_id=task.id,
            payload=TaskUpdate(project_id=project_b.id, assignee_ids=[self.other_user.id]),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(updated_proj.project_id, project_b.id)
        self.assertEqual([a.id for a in updated_proj.assignees], [self.other_user.id])

    def test_first_team_assignment_and_additional_task_workflow(self):
        # 1. Project Gamma starts with 0 members
        proj_gamma = Project(
            id=200,
            name="Project Gamma",
            description="Gamma project with initial team workflow",
            department=ProjectDepartment.EDUTECH,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=45),
            status=ProjectStatus.NOT_STARTED,
            manager_id=self.manager.id,
        )
        self.db.add(proj_gamma)
        self.db.commit()

        initial_count = self.db.query(ProjectMember).filter(ProjectMember.project_id == 200).count()
        self.assertEqual(initial_count, 0)

        # 2. First task assignment on Project Gamma with multiple assignees
        first_task = create_task(
            payload=TaskCreate(
                title="Gamma Setup",
                project_id=200,
                assignee_ids=[self.employee.id, self.intern.id],
                due_date=date.today() + timedelta(days=10),
            ),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(first_task.project_id, 200)
        self.assertEqual(len(first_task.assignees), 2)

        # Verifies project membership persisted in database
        saved_members = self.db.query(ProjectMember).filter(ProjectMember.project_id == 200).all()
        self.assertEqual(len(saved_members), 2)
        saved_user_ids = {m.user_id for m in saved_members}
        self.assertEqual(saved_user_ids, {self.employee.id, self.intern.id})

        # 3. Additional task creation under Project Gamma using saved team (assigning subset: employee only)
        second_task = create_task(
            payload=TaskCreate(
                title="Gamma Feature Implementation",
                project_id=200,
                assignee_ids=[self.employee.id],
                due_date=date.today() + timedelta(days=15),
            ),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(second_task.project_id, 200)
        self.assertEqual(len(second_task.assignees), 1)

        # Saved project team was NOT overwritten or duplicated!
        after_second_count = self.db.query(ProjectMember).filter(ProjectMember.project_id == 200).count()
        self.assertEqual(after_second_count, 2)

        # 4. Attempting to assign unauthorized non-member to Project Gamma is rejected
        with self.assertRaises(HTTPException) as ctx:
            create_task(
                payload=TaskCreate(
                    title="Gamma Unauthorized Task",
                    project_id=200,
                    assignee_ids=[self.other_user.id],
                    due_date=date.today() + timedelta(days=5),
                ),
                db=self.db,
                current_user=self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not a member", ctx.exception.detail.lower())

        # 5. Edit task assignees: changing assignees leaves project team unchanged
        updated_gamma = update_task(
            task_id=second_task.id,
            payload=TaskUpdate(assignee_ids=[self.intern.id]),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(updated_gamma.assignees[0].id, self.intern.id)
        final_team_count = self.db.query(ProjectMember).filter(ProjectMember.project_id == 200).count()
        self.assertEqual(final_team_count, 2)

    def test_task_assignee_deduplication_and_same_name_different_users(self):
        # Create two separate users with the identical name "admin"
        admin1 = User(id=301, full_name="admin", email="admin_one@test.com", role="admin", status="active")
        admin2 = User(id=302, full_name="admin", email="admin_two@test.com", role="admin", status="active")
        self.db.add_all([admin1, admin2])
        self.db.commit()

        project = Project(
            id=300,
            name="Standalone Or Project",
            description="Testing task assignee deduplication",
            department=ProjectDepartment.INGAGE,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=20),
            status=ProjectStatus.IN_PROGRESS,
            manager_id=self.manager.id,
        )
        self.db.add(project)
        self.db.commit()

        # Create task with duplicate IDs in assignee_ids: [admin1.id, admin1.id, admin2.id]
        payload = TaskCreate(
            title="Deduplication Task",
            project_id=project.id,
            assignee_ids=[admin1.id, admin1.id, admin2.id],
            due_date=date.today() + timedelta(days=5),
        )
        task = create_task(payload=payload, db=self.db, current_user=self.admin)

        # Assignees must be deduplicated by user ID, preserving genuinely different users
        self.assertEqual(len(task.assignees), 2)
        assignee_user_ids = {a.id for a in task.assignees}
        self.assertEqual(assignee_user_ids, {301, 302})
        # Both assignees have the name "admin" but are separate objects
        self.assertEqual(task.assignees[0].full_name, "admin")
        self.assertEqual(task.assignees[1].full_name, "admin")
        self.assertNotEqual(task.assignees[0].email, task.assignees[1].email)

        # Check build_task_response returns deduplicated list
        db_task = self.db.query(Task).filter(Task.id == task.id).first()
        resp = build_task_response(db_task, self.db)
        self.assertEqual(len(resp.assignees), 2)

        # Update task with duplicate user IDs
        updated = update_task(
            task_id=task.id,
            payload=TaskUpdate(assignee_ids=[admin1.id, admin1.id]),
            db=self.db,
            current_user=self.admin,
        )
        self.assertEqual(len(updated.assignees), 1)
        self.assertEqual(updated.assignees[0].id, 301)

    def test_personal_task_edit_and_delete(self):
        # 1. Employee creates a personal daily task
        task = create_personal_task(
            payload=PersonalTaskCreate(
                title="My Personal Work Task",
                description="Initial details",
                planned_start=date.today(),
                planned_end=date.today() + timedelta(days=1),
            ),
            db=self.db,
            current_user=self.employee,
        )
        self.assertEqual(task.title, "My Personal Work Task")
        self.assertEqual(task.project_id, None)

        # 2. Employee can edit their personal task
        updated = update_task(
            task_id=task.id,
            payload=TaskUpdate(
                title="Updated Personal Work Task",
                description="Updated details",
                priority="High",
            ),
            db=self.db,
            current_user=self.employee,
        )
        self.assertEqual(updated.title, "Updated Personal Work Task")
        self.assertEqual(updated.description, "Updated details")
        self.assertEqual(updated.priority, "High")

        # 3. Another user cannot edit or delete this personal task
        other_user = User(
            id=999,
            email="other@ingage.com",
            full_name="Other User",
            role="employee",
            password_hash="fake",
            status="active",
        )
        self.db.add(other_user)
        self.db.commit()

        with self.assertRaises(HTTPException) as ctx:
            update_task(
                task_id=task.id,
                payload=TaskUpdate(title="Unauthorized Edit"),
                db=self.db,
                current_user=other_user,
            )
        self.assertEqual(ctx.exception.status_code, 404)

        with self.assertRaises(HTTPException) as ctx:
            delete_task(
                task_id=task.id,
                db=self.db,
                current_user=other_user,
            )
        self.assertEqual(ctx.exception.status_code, 404)

        # 4. Employee can delete their own personal task
        delete_task(task_id=task.id, db=self.db, current_user=self.employee)

        # 5. Confirm task is deleted
        found = self.db.query(Task).filter(Task.id == task.id).first()
        self.assertIsNone(found)


if __name__ == "__main__":
    unittest.main()


