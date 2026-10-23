import asyncio
import os
import smtplib
import unittest
from datetime import timedelta
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.database import Base
from app.dependencies.auth import get_current_user, security
from app.dependencies.permissions import require_admin
from app.models.invitation import UserInvitation
from app.models.staff_profile import StaffCategory, StaffProfile, UserEducation
from app.models.user import User
from app.routers import admin_invitations, auth, users
from app.schemas.auth import LoginRequest
from app.schemas.invitations import (
    AdminInvitationCreate,
    AdminInvitationResponse,
    InvitationRegistration,
    InvitationValidateRequest,
)
from app.schemas.projects import StaffListItem
from app.security import hash_password, verify_password
from app.services.invitation_email import (
    InvitationEmailError,
    ensure_utc,
    hash_invitation_token,
    send_invitation_email,
    utc_now,
)


class InvitationWorkflowTests(unittest.TestCase):
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
            email="admin@example.com",
            role="admin",
            status="active",
            password_hash=hash_password("admin-password-123"),
        )
        self.db.add(self.admin)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def create_invitation(self, email="person@example.com", role="employee"):
        payload = AdminInvitationCreate(email=email, role=role)
        with patch("app.routers.admin_invitations.send_invitation_email") as send_email:
            result = admin_invitations.create_invitation(payload, self.db, self.admin)
        token = send_email.call_args.kwargs["token"]
        return result, token

    def register(self, token, full_name="TaskFlow User", department="Engineering", mobile="9876543210"):
        return auth.register_invitation(
            InvitationRegistration(
                token=token,
                full_name=full_name,
                password="a-strong-password-123",
                department=department,
                mobile=mobile,
            ),
            self.db,
        )

    def test_invitation_creates_token_hash_no_user_record_and_exact_5min_expiry(self):
        result, token = self.create_invitation(email="newhire@example.com", role="employee")
        self.assertEqual(result["email"], "newhire@example.com")
        self.assertEqual(result["role"], "employee")
        self.assertEqual(result["status"], "Pending")

        # Expiry is exactly 5 minutes
        self.assertEqual(
            ensure_utc(result["expires_at"]) - ensure_utc(result["sent_at"]),
            timedelta(minutes=5),
        )

        # Tokens and password hashes are never exposed in responses
        self.assertNotIn("token", result)
        self.assertNotIn("token_hash", result)
        self.assertNotIn("password_hash", result)

        # Check DB invitation record
        invitation = (
            self.db.query(UserInvitation)
            .filter(UserInvitation.id == result["id"])
            .one()
        )
        self.assertEqual(invitation.token_hash, hash_invitation_token(token))
        self.assertEqual(invitation.email, "newhire@example.com")

        # CRITICAL: users table record must NOT exist until registration completes
        user_in_db = self.db.query(User).filter_by(email="newhire@example.com").first()
        self.assertIsNone(user_in_db, "User record must not be created before registration completes!")

        # All Users table shows only actual users-table records
        listing = users.list_users(
            None,
            None,
            None,
            None,
            None,
            1,
            25,
            self.db,
            self.admin,
        )
        user_emails = [u["email"] for u in listing["items"]]
        self.assertNotIn("newhire@example.com", user_emails)
        self.assertIn("admin@example.com", user_emails)

    def test_token_validation_endpoint(self):
        result, token = self.create_invitation(email="candidate@example.com", role="intern")

        # Valid token
        val = auth.validate_invitation(InvitationValidateRequest(token=token), self.db)
        self.assertTrue(val["valid"])
        self.assertEqual(val["email"], "candidate@example.com")
        self.assertEqual(val["role"], "intern")

        # Invalid token
        with self.assertRaises(HTTPException) as invalid:
            auth.validate_invitation(InvitationValidateRequest(token="x" * 32), self.db)
        self.assertEqual(invalid.exception.status_code, 400)

        # Expired token
        inv = self.db.query(UserInvitation).filter_by(id=result["id"]).one()
        inv.expires_at = utc_now() - timedelta(seconds=1)
        self.db.commit()
        with self.assertRaises(HTTPException) as expired:
            auth.validate_invitation(InvitationValidateRequest(token=token), self.db)
        self.assertEqual(expired.exception.status_code, 410)

        # Revoked token
        inv.expires_at = utc_now() + timedelta(minutes=5)
        inv.revoked_at = utc_now()
        self.db.commit()
        with self.assertRaises(HTTPException) as revoked:
            auth.validate_invitation(InvitationValidateRequest(token=token), self.db)
        self.assertEqual(revoked.exception.status_code, 410)

    def test_registration_atomic_token_consumption_and_user_creation(self):
        result, token = self.create_invitation(email="joiner@example.com", role="employee")

        # Complete registration
        reg = self.register(token, full_name="John Doe", department="Design", mobile="9876500000")
        self.assertEqual(reg["email"], "joiner@example.com")
        self.assertEqual(reg["role"], "employee")
        self.assertEqual(reg["status"], "active")
        self.assertIsNotNone(reg["registration_completed_at"])

        # User is now in users table
        created_user = self.db.query(User).filter_by(email="joiner@example.com").one()
        self.assertEqual(created_user.full_name, "John Doe")
        self.assertEqual(created_user.role, "employee")
        self.assertEqual(created_user.status, "active")
        self.assertTrue(verify_password("a-strong-password-123", created_user.password_hash))

        # Profile created
        profile = self.db.query(StaffProfile).filter_by(user_id=created_user.id).one()
        self.assertEqual(profile.staff_category, StaffCategory.EMPLOYEE)
        self.assertEqual(profile.department, "Design")
        self.assertEqual(profile.mobile, "9876500000")

        # Invitation is marked completed
        inv = self.db.query(UserInvitation).filter_by(id=result["id"]).one()
        self.assertIsNotNone(inv.completed_at)
        self.assertEqual(inv.status, "completed")
        self.assertEqual(inv.user_id, created_user.id)

        # Token reuse rejected
        with self.assertRaises(HTTPException) as reused:
            self.register(token)
        self.assertEqual(reused.exception.status_code, 409)

        # Validation of used token rejected
        with self.assertRaises(HTTPException) as val_reused:
            auth.validate_invitation(InvitationValidateRequest(token=token), self.db)
        self.assertEqual(val_reused.exception.status_code, 409)

    def test_duplicate_email_and_role_escalation_prevention(self):
        # Admin creating invitation rejects if user already registered
        with self.assertRaises(HTTPException) as duplicate:
            admin_invitations.create_invitation(
                AdminInvitationCreate(email="admin@example.com", role="employee"),
                self.db,
                self.admin,
            )
        self.assertEqual(duplicate.exception.status_code, 409)

        # 'employee', 'intern', and 'manager' are accepted roles for invitation
        mgr_invite = AdminInvitationCreate(email="candidate@example.com", role="manager")
        self.assertEqual(mgr_invite.role, "manager")
        with self.assertRaises(ValidationError):
            AdminInvitationCreate(email="candidate@example.com", role="admin")
        with self.assertRaises(ValidationError):
            AdminInvitationCreate(email="candidate@example.com", role="vendor")

    def test_smtp_failure_rolls_back_safely(self):
        with patch(
            "app.routers.admin_invitations.send_invitation_email",
            side_effect=InvitationEmailError("Connection refused"),
        ):
            with self.assertRaises(HTTPException) as failure:
                admin_invitations.create_invitation(
                    AdminInvitationCreate(email="unsent@example.com", role="intern"),
                    self.db,
                    self.admin,
                )
        self.assertEqual(failure.exception.status_code, 502)

        # Verify no user created and no active unhandled record
        user = self.db.query(User).filter_by(email="unsent@example.com").first()
        self.assertIsNone(user)

    def test_resend_invitation_issues_new_token_and_fresh_expiry(self):
        result, old_token = self.create_invitation(email="resendee@example.com", role="intern")
        inv_id = result["id"]

        # Calling resend immediately should hit cooldown
        with self.assertRaises(HTTPException) as cooldown:
            admin_invitations.resend_invitation(inv_id, self.db, self.admin)
        self.assertEqual(cooldown.exception.status_code, 429)

        # Bypass 30s cooldown for testing
        inv = self.db.query(UserInvitation).filter_by(id=inv_id).one()
        inv.last_attempt_at = utc_now() - timedelta(seconds=35)
        self.db.commit()

        # Resend invitation
        with patch("app.routers.admin_invitations.send_invitation_email") as send_email:
            resend_result = admin_invitations.resend_invitation(inv_id, self.db, self.admin)
        new_token = send_email.call_args.kwargs["token"]

        self.assertNotEqual(old_token, new_token)
        self.assertEqual(
            ensure_utc(resend_result["expires_at"]) - ensure_utc(resend_result["sent_at"]),
            timedelta(minutes=5),
        )

        # Old token is invalidated
        with self.assertRaises(HTTPException) as old_invalid:
            self.register(old_token)
        self.assertEqual(old_invalid.exception.status_code, 400)

        # New token succeeds
        reg = self.register(new_token, full_name="Resent User")
        self.assertEqual(reg["role"], "intern")

        # After registration, resend is rejected
        inv.last_attempt_at = utc_now() - timedelta(seconds=35)
        self.db.commit()
        with self.assertRaises(HTTPException) as registered_resend:
            admin_invitations.resend_invitation(inv_id, self.db, self.admin)
        self.assertEqual(registered_resend.exception.status_code, 409)

    def test_existing_login_and_admin_flows_continue_working(self):
        # Admin can login
        response = auth.login(
            LoginRequest(
                email="admin@example.com",
                password="admin-password-123",
            ),
            self.db,
        )
        self.assertIn("access_token", response)
        self.assertEqual(response["role"], "admin")

        # Newly registered user can login
        _, token = self.create_invitation(email="worker@example.com", role="employee")
        self.register(token, full_name="Worker Bee")

        worker_login = auth.login(
            LoginRequest(
                email="worker@example.com",
                password="a-strong-password-123",
            ),
            self.db,
        )
        self.assertIn("access_token", worker_login)
        self.assertEqual(worker_login["role"], "employee")

        # Invalid login rejected
        with self.assertRaises(HTTPException) as invalid_login:
            auth.login(
                LoginRequest(
                    email="worker@example.com",
                    password="wrong-password",
                ),
                self.db,
            )
        self.assertEqual(invalid_login.exception.status_code, 401)

    def test_admin_invitations_list_endpoint(self):
        self.create_invitation(email="list1@example.com", role="employee")
        self.create_invitation(email="list2@example.com", role="intern")

        invitations = admin_invitations.list_invitations(None, self.db, self.admin)
        emails = [inv["email"] for inv in invitations]
        self.assertIn("list1@example.com", emails)
        self.assertIn("list2@example.com", emails)

    def test_smtp_message_uses_configured_frontend_and_tls(self):
        smtp_server = MagicMock()
        with patch.dict(
            os.environ,
            {
                "SMTP_HOST": "smtp.example.com",
                "SMTP_PORT": "587",
                "SMTP_USERNAME": "mailer",
                "SMTP_PASSWORD": "placeholder-password",
                "SMTP_FROM_EMAIL": "taskflow@example.com",
                "SMTP_USE_TLS": "true",
                "FRONTEND_BASE_URL": "https://taskflow.example.com",
            },
            clear=False,
        ), patch("app.services.invitation_email.smtplib.SMTP") as smtp:
            smtp.return_value.__enter__.return_value = smtp_server
            send_invitation_email(
                "invitee@example.com",
                "employee",
                "safe-token-value",
                utc_now() + timedelta(minutes=5),
            )

        smtp_server.starttls.assert_called_once()
        message = smtp_server.send_message.call_args.args[0]
        self.assertIn(
            "https://taskflow.example.com/register?token=safe-token-value",
            message.get_content(),
        )
        self.assertIn("Assigned role: Employee", message.get_content())

    def test_smtp_failures_report_safe_actionable_causes(self):
        environment = {
            "SMTP_HOST": "smtp.example.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "mailer@example.com",
            "SMTP_PASSWORD": "placeholder-password",
            "SMTP_FROM_EMAIL": "taskflow@example.com",
            "SMTP_USE_TLS": "true",
            "FRONTEND_BASE_URL": "https://taskflow.example.com",
        }
        old_env = {k: os.environ.get(k) for k in environment}
        try:
            os.environ.update(environment)
            server = MagicMock()
            server.login.side_effect = smtplib.SMTPAuthenticationError(
                535,
                b"private provider response",
            )
            with patch("app.services.invitation_email.smtplib.SMTP") as smtp:
                smtp.return_value.__enter__.return_value = server
                with self.assertRaises(InvitationEmailError) as authentication:
                    send_invitation_email(
                        "invitee@example.com",
                        "employee",
                        "safe-token-value",
                        utc_now() + timedelta(minutes=5),
                    )

            self.assertIn("authentication failed", str(authentication.exception))
            self.assertNotIn("private provider response", str(authentication.exception))
        finally:
            for k, v in old_env.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v


if __name__ == "__main__":
    unittest.main()
