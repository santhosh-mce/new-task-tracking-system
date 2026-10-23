import unittest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException

from app.database import Base
from app.models.user import User
from app.models.staff_profile import StaffProfile, StaffCategory
from app.models.project import Project, ProjectMember, ProjectDepartment, ProjectStatus
from app.models.task import Task, TaskAssignment
from app.routers.dashboard import dashboard_overview
from app.routers.projects import list_projects, get_project, duration_days
from app.routers.users import list_users
from app.routers.tasks import list_tasks


class DashboardOverviewTests(unittest.TestCase):
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
            full_name="Admin Boss",
            email="admin@test.com",
            role="admin",
            status="active",
        )
        self.emp1 = User(
            id=2,
            full_name="Active Employee",
            email="emp1@test.com",
            role="employee",
            status="active",
        )
        self.emp2 = User(
            id=3,
            full_name="Inactive Employee",
            email="emp2@test.com",
            role="employee",
            status="inactive",
        )
        self.intern1 = User(
            id=4,
            full_name="Active Intern",
            email="intern1@test.com",
            role="intern",
            status="active",
        )
        self.db.add_all([self.admin, self.emp1, self.emp2, self.intern1])
        self.db.flush()

        # Staff Profiles
        self.prof1 = StaffProfile(
            user_id=self.emp1.id,
            staff_category=StaffCategory.EMPLOYEE,
            employee_id="EMP-001",
            department="Ingage",
        )
        self.prof2 = StaffProfile(
            user_id=self.emp2.id,
            staff_category=StaffCategory.EMPLOYEE,
            employee_id="EMP-002",
            department="Rezov",
        )
        self.prof3 = StaffProfile(
            user_id=self.intern1.id,
            staff_category=StaffCategory.INTERN,
            intern_id="INT-001",
            department="Edutech",
        )
        self.db.add_all([self.prof1, self.prof2, self.prof3])
        self.db.flush()

        # Projects
        self.proj1 = Project(
            id=1,
            name="Alpha Platform",
            description="Core Platform Alpha",
            department=ProjectDepartment.INGAGE,
            status=ProjectStatus.IN_PROGRESS,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 1, 31),
            manager_id=self.admin.id,
        )
        self.proj2 = Project(
            id=2,
            name="Empty Project",
            description="Project with no tasks",
            department=ProjectDepartment.REZOV,
            status=ProjectStatus.NOT_STARTED,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 2, 10),
            manager_id=self.admin.id,
        )
        self.db.add_all([self.proj1, self.proj2])
        self.db.flush()

        # Memberships
        self.m1 = ProjectMember(project_id=1, user_id=self.emp1.id)
        self.m2 = ProjectMember(project_id=1, user_id=self.intern1.id)
        self.db.add_all([self.m1, self.m2])
        self.db.flush()

        # Tasks
        self.task1 = Task(
            id=1,
            project_id=1,
            title="Feature Alpha 1",
            status="Completed",
            progress=100,
        )
        self.task2 = Task(
            id=2,
            project_id=1,
            title="Feature Alpha 2",
            status="In Progress",
            progress=50,
        )
        self.db.add_all([self.task1, self.task2])
        self.db.flush()

        self.a1 = TaskAssignment(task_id=1, user_id=self.emp1.id)
        self.a2 = TaskAssignment(task_id=2, user_id=self.intern1.id)
        self.db.add_all([self.a1, self.a2])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def test_dashboard_overview_live_counts(self):
        overview = dashboard_overview(db=self.db, user=self.admin)
        self.assertEqual(overview["total_projects"], 2)
        self.assertEqual(overview["employees"], 2)
        self.assertEqual(overview["employees_active"], 1)
        self.assertEqual(overview["interns"], 1)
        self.assertEqual(overview["interns_active"], 1)

    def test_dashboard_overview_permissions(self):
        with self.assertRaises(HTTPException) as cm:
            dashboard_overview(db=self.db, user=self.emp1)
        self.assertEqual(cm.exception.status_code, 403)

    def test_list_projects_includes_duration_and_metrics(self):
        res = list_projects(db=self.db, user=self.admin)
        self.assertEqual(res["total"], 2)
        items = {item["id"]: item for item in res["items"]}

        # Proj 1 has 2 tasks, 1 completed -> 50%
        p1 = items[1]
        self.assertEqual(p1["duration_days"], 31)
        self.assertEqual(p1["completion_percent"], 50.0)
        self.assertEqual(p1["department"], "Ingage")

        # Proj 2 has 0 tasks -> 0%
        p2 = items[2]
        self.assertEqual(p2["duration_days"], 10)
        self.assertEqual(p2["completion_percent"], 0.0)

    def test_duration_safe_calculation(self):
        p = Project(
            name="No Date Project",
            department=ProjectDepartment.INGAGE,
            status=ProjectStatus.NOT_STARTED,
            start_date=None,
            end_date=None,
        )
        self.assertEqual(duration_days(p), 0)

    def test_project_tasks_scoped_query(self):
        tasks_res = list_tasks(project_id=1, db=self.db, current_user=self.admin)
        self.assertEqual(tasks_res.total, 2)
        task_titles = [t.title for t in tasks_res.items]
        self.assertIn("Feature Alpha 1", task_titles)
        self.assertIn("Feature Alpha 2", task_titles)

    def test_user_tasks_scoped_query(self):
        emp_tasks = list_tasks(user_id=self.emp1.id, db=self.db, current_user=self.admin)
        self.assertEqual(emp_tasks.total, 1)
        self.assertEqual(emp_tasks.items[0].title, "Feature Alpha 1")


if __name__ == "__main__":
    unittest.main()
