import os
import unittest
from datetime import date, timedelta
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["SECRET_KEY"] = "test-secret-key-for-profile-testing-32chars"

from app.database import Base
from app.models.invitation import UserInvitation
from app.models.staff_profile import StaffCategory, StaffProfile
from app.models.user import User
from app.routers import admin_invitations, auth, profile
from app.schemas.invitations import (
    AdminInvitationCreate,
    InvitationRegistration,
    InvitationValidateRequest,
)
from app.schemas.profile import ProfileCompletionRequest
from app.security import hash_password
from app.services.invitation_email import ensure_utc, utc_now


class TestProfileWorkflow(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.admin = User(
            full_name="Workspace Admin",
            email="admin@example.com",
            password_hash=hash_password("admin-secret-pass-123"),
            role="admin",
            status="active",
            profile_status="complete",
        )
        self.manager = User(
            full_name="Team Manager",
            email="manager@example.com",
            password_hash=hash_password("manager-secret-pass-123"),
            role="manager",
            status="active",
            profile_status="complete",
        )
        self.db.add_all([self.admin, self.manager])
        self.db.commit()
        self.db.refresh(self.admin)
        self.db.refresh(self.manager)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    def test_manager_cannot_invite_manager(self):
        """Only authorized Admin may invite Managers."""
        payload = AdminInvitationCreate(
            email="newmanager@example.com",
            role="manager",
        )
        with self.assertRaises(HTTPException) as ctx:
            admin_invitations.create_invitation(payload, self.db, self.manager)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Only authorized Administrators may invite Managers", ctx.exception.detail)

    def test_admin_can_invite_manager_employee_intern(self):
        """Admin can invite employee, intern, and manager."""
        for role in ["employee", "intern", "manager"]:
            email = f"user_{role}@example.com"
            payload = AdminInvitationCreate(email=email, role=role)
            with patch("app.routers.admin_invitations.send_invitation_email") as mock_send:
                res = admin_invitations.create_invitation(payload, self.db, self.admin)
                self.assertEqual(res["email"], email)
                self.assertEqual(res["role"], role)
                self.assertEqual(res["status"], "Pending")

    def test_invitation_expiry_and_duplicate_handling(self):
        """Single-use invitation link expires in 5 minutes and rejects duplicates."""
        payload = AdminInvitationCreate(email="expiry_test@example.com", role="employee")
        with patch("app.routers.admin_invitations.send_invitation_email") as mock_send:
            res = admin_invitations.create_invitation(payload, self.db, self.admin)
            token = mock_send.call_args.kwargs["token"]

        # 5 minutes expiry check
        self.assertEqual(
            ensure_utc(res["expires_at"]) - ensure_utc(res["sent_at"]),
            timedelta(minutes=5),
        )

        # Token validation works
        val = auth.validate_invitation(InvitationValidateRequest(token=token), self.db)
        self.assertTrue(val["valid"])
        self.assertEqual(val["email"], "expiry_test@example.com")

        # Manually expire invitation in database
        inv = self.db.query(UserInvitation).filter(UserInvitation.id == res["id"]).first()
        inv.expires_at = utc_now() - timedelta(minutes=1)
        self.db.commit()

        # Validating or registering with expired token must be rejected with 410 Gone
        with self.assertRaises(HTTPException) as ctx:
            auth.validate_invitation(InvitationValidateRequest(token=token), self.db)
        self.assertEqual(ctx.exception.status_code, 410)

        with self.assertRaises(HTTPException) as ctx:
            auth.register_invitation(
                InvitationRegistration(token=token, password="a-secure-password-123"),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 410)

    def test_password_setup_creates_incomplete_profile_and_first_login_flow(self):
        """Candidate sets password, account created as Profile Incomplete, and can login."""
        payload = AdminInvitationCreate(email="hire@example.com", role="employee")
        with patch("app.routers.admin_invitations.send_invitation_email") as mock_send:
            res = admin_invitations.create_invitation(payload, self.db, self.admin)
            token = mock_send.call_args.kwargs["token"]

        # Register without full name or details (only password on invitation page)
        reg_res = auth.register_invitation(
            InvitationRegistration(
                token=token,
                password="my-strong-password-999",
                password_confirmation="my-strong-password-999",
            ),
            self.db,
        )
        self.assertEqual(reg_res["status"], "active")
        self.assertEqual(reg_res["profile_status"], "incomplete")

        # Verify token was consumed atomically and cannot be reused
        with self.assertRaises(HTTPException) as ctx:
            auth.register_invitation(
                InvitationRegistration(
                    token=token,
                    password="my-strong-password-999",
                ),
                self.db,
            )
        self.assertEqual(ctx.exception.status_code, 409)

        # Login with newly set password
        from app.schemas.auth import LoginRequest
        login_res = auth.login(
            LoginRequest(email="hire@example.com", password="my-strong-password-999"),
            self.db,
        )
        self.assertIn("access_token", login_res)
        self.assertEqual(login_res["profile_status"], "incomplete")

        # Fetch profile
        created_user = self.db.query(User).filter(User.email == "hire@example.com").first()
        my_prof = profile.get_my_profile(self.db, created_user)
        self.assertEqual(my_prof.profile_status, "incomplete")
        self.assertEqual(my_prof.staff_id, f"EMP-{created_user.id:04d}")

        # Complete profile validation: required fields (full_name, mobile, highest_qualification)
        # 1. Missing mobile or invalid mobile triggers validation error
        from pydantic import ValidationError
        with self.assertRaises(ValidationError):
            ProfileCompletionRequest(
                full_name="Hire Person",
                mobile="12",  # too short (< 7)
                highest_qualification="B.Tech Computer Science",
            )

        # 2. Invalid reporting manager ID triggers HTTPException 400
        with self.assertRaises(HTTPException) as ctx:
            profile.complete_or_update_profile(
                ProfileCompletionRequest(
                    full_name="Hire Person",
                    mobile="+91 9876543210",
                    highest_qualification="B.Tech Computer Science",
                    reporting_manager_id=99999,  # invalid manager id
                ),
                self.db,
                created_user,
            )
        self.assertEqual(ctx.exception.status_code, 400)

        # 2. Valid completion
        comp_res = profile.complete_or_update_profile(
            ProfileCompletionRequest(
                full_name="Hire Person",
                mobile="+91 9876543210",
                dob=date(1998, 5, 20),
                gender="Male",
                address="123 Tech Park",
                city="Chennai",
                highest_qualification="B.Tech Information Technology",
                institution="Anna University",
                degree="Information Technology",
                graduation_year=2020,
                skills=["React", "Python", "FastAPI"],
                department="Ingage",
                joining_date=date(2026, 11, 1),
                reporting_manager_id=self.manager.id,
                work_location="Chennai Office",
            ),
            self.db,
            created_user,
        )
        self.assertEqual(comp_res.profile_status, "complete")
        self.assertEqual(comp_res.full_name, "Hire Person")
        self.assertEqual(comp_res.mobile, "+91 9876543210")
        self.assertEqual(comp_res.department, "Ingage")
        self.assertEqual(comp_res.highest_qualification, "B.Tech Information Technology")
        self.assertEqual(comp_res.reporting_manager_id, self.manager.id)
        self.assertEqual(comp_res.staff_id, f"EMP-{created_user.id:04d}")

        # Verify in database that user profile_status is now complete
        self.db.refresh(created_user)
        self.assertEqual(created_user.profile_status, "complete")
        self.assertEqual(created_user.full_name, "Hire Person")

    def test_extended_profile_sections_and_completion_percentage(self):
        user = User(
            full_name="Alex River",
            email="alex.river@example.com",
            password_hash=hash_password("alex-pass-123"),
            role="employee",
            status="active",
            profile_status="incomplete",
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        # Complete with full extended payload
        req = ProfileCompletionRequest(
            full_name="Alex River",
            mobile="+91 9988776655",
            city="Chennai",
            state="Tamil Nadu",
            country="India",
            department="Ingage",
            highest_qualification="B.Tech Computer Science",
            education_records=[
                {
                    "institution": "Anna University",
                    "degree": "B.Tech CSE",
                    "status": "Completed",
                    "passing_year": 2024,
                    "score": "8.9 CGPA",
                }
            ],
            skills=["Python", "FastAPI", "React"],
            soft_skills=["Communication", "Teamwork"],
            languages=[{"name": "English", "proficiency": "Fluent"}],
            certifications=[
                {
                    "name": "AWS Certified Developer",
                    "issuer": "Amazon Web Services",
                    "issue_date": "2024",
                }
            ],
            work_experience=[
                {
                    "company": "Tech Innovations",
                    "title": "Junior Developer",
                    "employment_type": "Full-time",
                }
            ],
            projects=[
                {
                    "name": "Task Tracker App",
                    "technologies": "React, FastAPI",
                    "github_url": "https://github.com/example/tasks",
                }
            ],
            professional_links={"linkedin": "https://linkedin.com/in/alex", "github": "https://github.com/alex"},
        )
        resp = profile.complete_or_update_profile(req, self.db, user)
        self.assertEqual(resp.profile_status, "complete")
        self.assertEqual(resp.state, "Tamil Nadu")
        self.assertEqual(len(resp.skills), 3)
        self.assertEqual(len(resp.soft_skills), 2)
        self.assertEqual(len(resp.languages), 1)
        self.assertEqual(len(resp.certifications), 1)
        self.assertEqual(len(resp.work_experience), 1)
        self.assertEqual(len(resp.projects), 1)
        self.assertGreaterEqual(resp.profile_completion_percentage, 80)
