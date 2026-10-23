from datetime import date, timedelta
import unittest

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.attendance import DailyAttendance
from app.models.invitation import UserInvitation
from app.models.project import Project, ProjectMember
from app.models.staff_profile import StaffCategory, StaffProfile, UserEducation
from app.models.task import Task, TaskAssignment
from app.models.user import User
from app.routers import employees, interns
from app.schemas.staff_management import EmployeeCreate, EmployeeUpdate, InternCreate, InternUpdate
from app.security import hash_password


class EmployeesInternsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        User.__table__.create(self.engine)
        StaffProfile.__table__.create(self.engine)
        UserEducation.__table__.create(self.engine)
        UserInvitation.__table__.create(self.engine)
        Project.__table__.create(self.engine)
        ProjectMember.__table__.create(self.engine)
        Task.__table__.create(self.engine)
        TaskAssignment.__table__.create(self.engine)
        DailyAttendance.__table__.create(self.engine)

        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.Session()

        # Admin
        self.admin = User(
            full_name="TaskFlow Admin",
            email="admin@ingage.com",
            role="admin",
            status="active",
            password_hash=hash_password("admin-secret-123"),
        )
        # Manager / Mentor
        self.manager = User(
            full_name="Lead Manager",
            email="manager@ingage.com",
            role="manager",
            status="active",
            password_hash=hash_password("manager-secret-123"),
        )
        # Employee 1
        self.emp1 = User(
            full_name="Alice Engineer",
            email="alice@ingage.com",
            role="employee",
            status="active",
            password_hash=hash_password("alice-secret-123"),
        )
        # Intern 1
        self.intern1 = User(
            full_name="Bob Intern",
            email="bob@ingage.com",
            role="intern",
            status="active",
            password_hash=hash_password("bob-secret-123"),
        )

        self.db.add_all([self.admin, self.manager, self.emp1, self.intern1])
        self.db.commit()

        # Profiles
        self.emp1_prof = StaffProfile(
            user_id=self.emp1.id,
            staff_category=StaffCategory.EMPLOYEE,
            employee_id="EMP-0001",
            staff_id="EMP-0001",
            department="Ingage",
            designation="Senior Engineer",
            joining_date=date(2025, 1, 15),
            mobile="9876543210",
            reporting_manager_id=self.manager.id,
        )
        today = date.today()
        self.intern1_prof = StaffProfile(
            user_id=self.intern1.id,
            staff_category=StaffCategory.INTERN,
            intern_id="INT-0001",
            staff_id="INT-0001",
            department="Rezov",
            institution="IIT Madras",
            joining_date=today - timedelta(days=30),
            internship_end_date=today + timedelta(days=7),  # Ending soon!
            internship_status="Active",
            mobile="9876500000",
            reporting_manager_id=self.manager.id,
        )
        self.db.add_all([self.emp1_prof, self.intern1_prof])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        DailyAttendance.__table__.drop(self.engine, checkfirst=True)
        TaskAssignment.__table__.drop(self.engine, checkfirst=True)
        Task.__table__.drop(self.engine, checkfirst=True)
        ProjectMember.__table__.drop(self.engine, checkfirst=True)
        Project.__table__.drop(self.engine, checkfirst=True)
        UserInvitation.__table__.drop(self.engine, checkfirst=True)
        UserEducation.__table__.drop(self.engine, checkfirst=True)
        StaffProfile.__table__.drop(self.engine, checkfirst=True)
        User.__table__.drop(self.engine, checkfirst=True)

    def test_employee_stats_and_list(self):
        stats = employees.get_employee_stats(db=self.db, current_user=self.admin)
        self.assertEqual(stats.total_employees, 1)
        self.assertEqual(stats.active_employees, 1)
        self.assertEqual(stats.inactive_employees, 0)

        res = employees.list_employees(q=None, department=None, status=None, attendance_status=None, sort_by="name", sort_dir="asc", page=1, page_size=10, db=self.db, current_user=self.admin)
        self.assertEqual(res.total, 1)
        self.assertEqual(res.items[0].email, "alice@ingage.com")
        self.assertEqual(res.items[0].employee_id, "EMP-0001")
        self.assertEqual(res.items[0].department, "Ingage")

    def test_create_and_update_employee(self):
        payload = EmployeeCreate(
            email="charlie@ingage.com",
            password="CharliePass#2026",
            full_name="Charlie Dev",
            department="Edutech",
            designation="QA Engineer",
            joining_date="2026-03-01",
            mobile="9123456780",
        )
        created = employees.create_employee(payload, db=self.db, admin=self.admin)
        self.assertEqual(created["email"], "charlie@ingage.com")

        # Update
        update_data = EmployeeUpdate(designation="Lead QA", department="Rezov")
        upd = employees.update_employee(created["id"], update_data, db=self.db, admin=self.admin)
        self.assertEqual(upd["id"], created["id"])

        det = employees.get_employee_details(created["id"], db=self.db, current_user=self.admin)
        self.assertEqual(det.designation, "Lead QA")
        self.assertEqual(det.department, "Rezov")

    def test_intern_stats_and_list(self):
        stats = interns.get_intern_stats(db=self.db, current_user=self.admin)
        self.assertEqual(stats.total_interns, 1)
        self.assertEqual(stats.active_interns, 1)
        self.assertEqual(stats.ending_soon, 1)  # Due in 7 days!

        res = interns.list_interns(q=None, mentor_id=None, project_id=None, status=None, department=None, sort_by="name", sort_dir="asc", page=1, page_size=10, db=self.db, current_user=self.admin)
        self.assertEqual(res.total, 1)
        self.assertEqual(res.items[0].email, "bob@ingage.com")
        self.assertEqual(res.items[0].college, "IIT Madras")
        self.assertTrue(res.items[0].is_ending_soon)

    def test_create_and_update_intern(self):
        payload = InternCreate(
            email="david@ingage.com",
            password="DavidPass#2026",
            full_name="David Intern",
            college="NIT Trichy",
            department="Ingage",
            start_date="2026-01-01",
            end_date="2026-06-30",
        )
        created = interns.create_intern(payload, db=self.db, admin=self.admin)
        self.assertEqual(created["email"], "david@ingage.com")

        # Get details
        det = interns.get_intern_details(created["id"], db=self.db, current_user=self.admin)
        self.assertEqual(det.college, "NIT Trichy")
        self.assertEqual(det.department, "Ingage")

        # Update status to completed
        status_upd = interns.update_intern_status(created["id"], {"internship_status": "Completed"}, db=self.db, admin=self.admin)
        self.assertEqual(status_upd["internship_status"], "Completed")
