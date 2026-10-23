from datetime import timedelta
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.dependencies.permissions import require_onboarded_user
from app.models.invitation import UserInvitation
from app.models.staff_profile import StaffProfile, UserEducation
from app.models.user import User
from app.routers import admin_invitations, auth, users
from app.schemas.auth import ChangePasswordRequest, LoginRequest
from app.schemas.invitations import AdminInvitationCreate
from app.schemas.users import UserProfileComplete
from app.security import hash_password, verify_password
from app.services.invitation_email import utc_now


class OnboardingWorkflowTests(unittest.TestCase):
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
        self.Session = sessionmaker(bind=self.engine, autoflush=False)
        self.db = self.Session()

        self.admin = User(
            full_name="TaskFlow Admin",
            email="admin@ingage.com",
            role="admin",
            status="active",
            password_hash=hash_password("admin-secret-123"),
            must_change_password=False,
            onboarding_status="completed",
        )
        self.db.add(self.admin)
        self.db.commit()
        self.db.refresh(self.admin)

    def tearDown(self):
        self.db.close()
        UserInvitation.__table__.drop(self.engine, checkfirst=True)
        UserEducation.__table__.drop(self.engine, checkfirst=True)
        StaffProfile.__table__.drop(self.engine, checkfirst=True)
        User.__table__.drop(self.engine, checkfirst=True)

    def test_admin_create_user_with_temp_password_and_send_email(self):
        """Admin can invite a new user with a password, creating user & sending email."""
        payload = AdminInvitationCreate(
            email="newhire@example.com",
            role="employee",
            temporary_password="TempPassword@2026",
        )

        with patch("app.routers.admin_invitations.send_temporary_password_email") as mock_email:
            res = admin_invitations.create_invitation(
                data=payload,
                db=self.db,
                admin=self.admin,
            )

            self.assertEqual(res["email"], "newhire@example.com")
            self.assertEqual(res["role"], "employee")
            self.assertEqual(res["status"], "Pending")
            mock_email.assert_called_once()
            call_kwargs = mock_email.call_args.kwargs
            self.assertEqual(call_kwargs["email"], "newhire@example.com")
            self.assertEqual(call_kwargs["role"], "employee")
            self.assertEqual(call_kwargs["temporary_password"], "TempPassword@2026")

        # Verify user in database
        user = self.db.query(User).filter(User.email == "newhire@example.com").first()
        self.assertIsNotNone(user)
        self.assertTrue(verify_password("TempPassword@2026", user.password_hash))
        self.assertEqual(user.status, "active")

        # Verify initial profile in database
        profile = self.db.query(StaffProfile).filter(StaffProfile.user_id == user.id).first()
        self.assertIsNotNone(profile)

    def test_admin_create_user_auto_generates_random_temp_password_and_emails(self):
        """When admin creates a user without providing a password, a random password is generated & emailed."""
        payload = AdminInvitationCreate(
            full_name="Random User",
            email="randomhire@example.com",
            role="employee",
            department="Product",
            employee_id="EMP-9900",
            temporary_password=None,
        )

        with patch("app.routers.admin_invitations.send_temporary_password_email") as mock_email:
            res = admin_invitations.create_invitation(
                data=payload,
                db=self.db,
                admin=self.admin,
            )

            self.assertEqual(res["email"], "randomhire@example.com")
            self.assertEqual(res["role"], "employee")
            self.assertEqual(res["status"], "Pending")
            self.assertIsNone(res["setup_link"])
            mock_email.assert_called_once()
            call_kwargs = mock_email.call_args.kwargs
            self.assertEqual(call_kwargs["email"], "randomhire@example.com")
            self.assertEqual(call_kwargs["role"], "employee")
            generated_pwd = call_kwargs["temporary_password"]
            self.assertTrue(generated_pwd.startswith("TaskFlow@"))
            self.assertGreaterEqual(len(generated_pwd), 8)

        # Verify user in database
        user = self.db.query(User).filter(User.email == "randomhire@example.com").first()
        self.assertIsNotNone(user)
        self.assertEqual(user.status, "active")
        self.assertTrue(user.must_change_password)
        self.assertTrue(verify_password(generated_pwd, user.password_hash))

    def test_duplicate_user_creation_rejected(self):
        """Attempting to add an existing email must raise 409 Conflict."""
        payload = AdminInvitationCreate(
            email="admin@ingage.com",
            role="employee",
            temporary_password="AnotherTempPass@123",
        )
        with self.assertRaises(HTTPException) as ctx:
            admin_invitations.create_invitation(
                data=payload,
                db=self.db,
                admin=self.admin,
            )
        self.assertEqual(ctx.exception.status_code, 409)

    def test_login_with_temp_password_allows_direct_login(self):
        """User logs in directly with created credentials and receives valid session."""
        # Create user
        payload = AdminInvitationCreate(
            email="developer@example.com",
            role="employee",
            temporary_password="InitialSecret#99",
        )
        with patch("app.routers.admin_invitations.send_temporary_password_email"):
            admin_invitations.create_invitation(
                data=payload,
                db=self.db,
                admin=self.admin,
            )

        # Login
        login_req = LoginRequest(email="developer@example.com", password="InitialSecret#99")
        login_res = auth.login(data=login_req, db=self.db)

        self.assertEqual(login_res["role"], "employee")
        self.assertIn("access_token", login_res)

    def test_user_can_access_application_resources(self):
        """require_onboarded_user allows authenticated active users without blocking."""
        active_user = User(
            full_name="Active Hire",
            email="hire@example.com",
            role="employee",
            status="active",
            password_hash=hash_password("Temp#12345"),
            must_change_password=False,
            onboarding_status="completed",
        )
        returned_user = require_onboarded_user(active_user)
        self.assertEqual(returned_user.email, "hire@example.com")

    def test_first_time_password_change_flow(self):
        """Change password validates current password, sets new password, and updates user."""
        user = User(
            full_name="Hire One",
            email="hire1@example.com",
            role="employee",
            status="active",
            password_hash=hash_password("TempPass@100"),
            must_change_password=False,
            onboarding_status="completed",
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        # 1. Invalid current password fails
        bad_change = ChangePasswordRequest(
            current_password="WrongPassword!",
            new_password="NewSecurePassword@1",
            confirm_password="NewSecurePassword@1",
        )
        with self.assertRaises(HTTPException) as ctx:
            auth.change_password(data=bad_change, db=self.db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Current temporary password is incorrect", ctx.exception.detail)

        # 2. Mismatched passwords fail
        mismatch_change = ChangePasswordRequest(
            current_password="TempPass@100",
            new_password="NewSecurePassword@1",
            confirm_password="MismatchPassword@2",
        )
        with self.assertRaises(HTTPException) as ctx:
            auth.change_password(data=mismatch_change, db=self.db, current_user=user)
        self.assertEqual(ctx.exception.status_code, 400)

        # 3. Successful change
        good_change = ChangePasswordRequest(
            current_password="TempPass@100",
            new_password="BrandNewPassword#2026",
            confirm_password="BrandNewPassword#2026",
        )
        res = auth.change_password(data=good_change, db=self.db, current_user=user)

        self.assertFalse(res["must_change_password"])
        self.assertTrue(verify_password("BrandNewPassword#2026", user.password_hash))
        self.assertFalse(verify_password("TempPass@100", user.password_hash))
        self.assertIn("access_token", res)

    def test_complete_profile_flow(self):
        """Profile completion persists details and updates profile."""
        user = User(
            full_name="",
            email="hire2@example.com",
            role="intern",
            status="active",
            profile_status="incomplete",
            password_hash=hash_password("NewPass#123"),
            must_change_password=False,
            onboarding_status="completed",
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        profile = StaffProfile(
            user_id=user.id,
        )
        self.db.add(profile)
        self.db.commit()

        # Submit profile completion
        profile_data = UserProfileComplete(
            full_name="Santhosh Kumar",
            mobile="9876543210",
            designation="Frontend Intern",
            department="Engineering",
            work_location="Chennai Office",
            joining_date="2026-10-21",
            bio="Passionate developer",
        )

        res = users.complete_my_profile(data=profile_data, db=self.db, current_user=user)

        self.assertEqual(res["onboarding_status"], "completed")
        self.assertEqual(res["full_name"], "Santhosh Kumar")
        self.assertEqual(user.profile_status, "complete")
        self.assertEqual(profile.designation, "Frontend Intern")
        self.assertEqual(profile.mobile, "9876543210")

    def test_resend_invitation_flow(self):
        """Admin can resend invitation with temporary password."""
        # Create user
        payload = AdminInvitationCreate(
            email="resend@example.com",
            role="employee",
            temporary_password="OldTempPass@123",
        )
        with patch("app.routers.admin_invitations.send_temporary_password_email"):
            admin_invitations.create_invitation(
                data=payload,
                db=self.db,
                admin=self.admin,
            )

        # Fast forward invitation cooldown timer to allow resend
        invitation = self.db.query(UserInvitation).filter(UserInvitation.email == "resend@example.com").first()
        self.assertIsNotNone(invitation)
        invitation.last_attempt_at = utc_now() - timedelta(seconds=60)
        self.db.commit()

        # Resend by email
        with patch("app.routers.admin_invitations.send_temporary_password_email") as mock_email:
            res = admin_invitations.resend_invitation_by_email(
                email="resend@example.com",
                db=self.db,
                admin=self.admin,
            )
            self.assertEqual(res["status"], "Pending")
            mock_email.assert_called_once()
