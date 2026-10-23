import sys
import unittest
from datetime import date, datetime, timedelta
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models import User, Project, ProjectMember, Task, TaskAssignment, AttendanceCorrection
from app.models.task import Notification
from app.services.notification_service import (
    create_notification,
    notify_project_assignment,
    notify_task_assignment,
    notify_task_status_changed,
    notify_task_review_submitted,
    notify_task_review_decision,
    notify_attendance_correction,
    notify_attendance_correction_decision,
    check_and_notify_task_deadlines,
)
from app.security import hash_password


class TestNotificationFeature(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        # Find or create test users
        cls.admin = cls.db.query(User).filter(User.role == "admin").first()
        if not cls.admin:
            cls.admin = User(
                email="test_notif_admin@ingage.com",
                full_name="Test Notif Admin",
                role="admin",
                status="active",
                password_hash=hash_password("adminSecret123"),
            )
            cls.db.add(cls.admin)
            cls.db.commit()

        # Create temporary test employee and intern
        cls.emp = cls.db.query(User).filter(User.email == "test_emp_notif@ingage.com").first()
        if not cls.emp:
            cls.emp = User(
                email="test_emp_notif@ingage.com",
                full_name="Test Emp Notif",
                role="employee",
                status="active",
                password_hash=hash_password("empSecret123"),
            )
            cls.db.add(cls.emp)
            cls.db.commit()

        cls.intern = cls.db.query(User).filter(User.email == "test_intern_notif@ingage.com").first()
        if not cls.intern:
            cls.intern = User(
                email="test_intern_notif@ingage.com",
                full_name="Test Intern Notif",
                role="intern",
                status="active",
                password_hash=hash_password("internSecret123"),
            )
            cls.db.add(cls.intern)
            cls.db.commit()

    @classmethod
    def tearDownClass(cls):
        # Clean up test notifications
        cls.db.query(Notification).filter(
            Notification.user_id.in_([cls.emp.id, cls.intern.id])
        ).delete(synchronize_session=False)
        cls.db.query(User).filter(
            User.email.in_(["test_emp_notif@ingage.com", "test_intern_notif@ingage.com"])
        ).delete(synchronize_session=False)
        cls.db.commit()
        cls.db.close()

    def test_01_create_notification_and_duplicate_prevention(self):
        event_key = f"test_dup_{self.emp.id}_{date.today()}"
        # Create first
        n1 = create_notification(
            db=self.db,
            user_id=self.emp.id,
            title="Test Alert",
            message="First message",
            notification_type="task",
            event_id=event_key,
        )
        self.db.commit()
        self.assertIsNotNone(n1)

        # Attempt to create duplicate with same event_id
        n2 = create_notification(
            db=self.db,
            user_id=self.emp.id,
            title="Duplicate Alert",
            message="Second message",
            notification_type="task",
            event_id=event_key,
        )
        self.db.commit()
        self.assertEqual(n1.id, n2.id, "Duplicate notification should return existing without re-inserting")

    def test_02_project_assignment_notification(self):
        notify_project_assignment(
            db=self.db,
            project_id=999,
            project_name="Beta Project",
            user_ids=[self.emp.id, self.intern.id],
            assigner=self.admin,
        )
        self.db.commit()

        emp_notifs = (
            self.db.query(Notification)
            .filter(
                Notification.user_id == self.emp.id,
                Notification.notification_type == "project",
            )
            .all()
        )
        self.assertTrue(len(emp_notifs) >= 1)
        self.assertIn("Beta Project", emp_notifs[-1].title)

    def test_03_task_assignment_notification(self):
        # Create dummy task
        task = Task(
            title="Build Notification Bell",
            status="Assigned",
            priority="High",
            assigned_by_id=self.admin.id,
            due_date=date.today() + timedelta(days=2),
        )
        self.db.add(task)
        self.db.commit()

        notify_task_assignment(
            db=self.db,
            task=task,
            user_ids=[self.intern.id],
            assigner=self.admin,
        )
        self.db.commit()

        notif = (
            self.db.query(Notification)
            .filter(
                Notification.user_id == self.intern.id,
                Notification.task_id == task.id,
            )
            .first()
        )
        self.assertIsNotNone(notif)
        self.assertIn("Build Notification Bell", notif.title)

        # Clean up task
        self.db.delete(task)
        self.db.commit()

    def test_04_attendance_correction_notification(self):
        now_dt = datetime.now()
        correction = AttendanceCorrection(
            user_id=self.intern.id,
            request_date=date.today(),
            requested_check_in=now_dt - timedelta(hours=8),
            requested_check_out=now_dt,
            reason="Card swipe delay",
            status="Pending",
        )
        self.db.add(correction)
        self.db.commit()

        notify_attendance_correction(self.db, correction, self.intern)
        self.db.commit()

        admin_notif = (
            self.db.query(Notification)
            .filter(
                Notification.user_id == self.admin.id,
                Notification.notification_type == "attendance",
            )
            .first()
        )
        self.assertIsNotNone(admin_notif)

        # Test decision notification back to intern
        correction.status = "Approved"
        notify_attendance_correction_decision(self.db, correction, self.admin)
        self.db.commit()

        intern_notif = (
            self.db.query(Notification)
            .filter(
                Notification.user_id == self.intern.id,
                Notification.notification_type == "attendance",
            )
            .first()
        )
        self.assertIsNotNone(intern_notif)
        self.assertIn("Approved", intern_notif.title)

        # Clean up correction
        self.db.delete(correction)
        self.db.commit()

    def test_05_deadline_alerts(self):
        task_overdue = Task(
            title="Overdue Documentation",
            status="In Progress",
            priority="Urgent",
            assigned_by_id=self.admin.id,
            due_date=date.today() - timedelta(days=2),
        )
        self.db.add(task_overdue)
        self.db.flush()
        self.db.add(TaskAssignment(task_id=task_overdue.id, user_id=self.emp.id))
        self.db.commit()

        check_and_notify_task_deadlines(self.db, self.emp)
        self.db.commit()

        alert = (
            self.db.query(Notification)
            .filter(
                Notification.user_id == self.emp.id,
                Notification.task_id == task_overdue.id,
                Notification.notification_type == "deadline_overdue",
            )
            .first()
        )
        self.assertIsNotNone(alert)
        self.assertIn("Overdue", alert.title)

        # Clean up
        self.db.query(TaskAssignment).filter(TaskAssignment.task_id == task_overdue.id).delete(synchronize_session=False)
        self.db.delete(task_overdue)
        self.db.commit()


if __name__ == "__main__":
    unittest.main()
