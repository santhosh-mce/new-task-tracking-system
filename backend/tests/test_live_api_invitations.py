import unittest
from datetime import timedelta
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.invitation import UserInvitation
from app.models.staff_profile import StaffCategory, StaffProfile, UserEducation
from app.models.user import User
from app.routers import admin_invitations, auth, users
from app.schemas.auth import LoginRequest
from app.schemas.invitations import (
    AdminInvitationCreate,
    InvitationRegistration,
    InvitationValidateRequest,
)
from app.security import hash_password
from app.services.invitation_email import ensure_utc, utc_now


class RouterApiInvitationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        User.__table__.create(cls.engine)
        StaffProfile.__table__.create(cls.engine)
        UserEducation.__table__.create(cls.engine)
        UserInvitation.__table__.create(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine, autoflush=False)

    def setUp(self):
        self.db = self.Session()
        # Seed admin
        self.admin = User(
            full_name="System Admin",
            email="sysadmin@example.com",
            role="admin",
            status="active",
            password_hash=hash_password("admin-secret-pass-123"),
        )
        self.db.add(self.admin)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        with self.engine.begin() as conn:
            conn.execute(UserInvitation.__table__.delete())
            conn.execute(StaffProfile.__table__.delete())
            conn.execute(User.__table__.delete())

    def test_full_invite_validate_register_resend_workflow(self):
        # 1. Admin sends invitation
        with patch("app.routers.admin_invitations.send_invitation_email") as mock_send:
            invite_data = admin_invitations.create_invitation(
                AdminInvitationCreate(email="recruit@example.com", role="intern"),
                self.db,
                self.admin,
            )
        self.assertEqual(invite_data["email"], "recruit@example.com")
        self.assertEqual(invite_data["role"], "intern")
        self.assertEqual(invite_data["status"], "Pending")

        # Verify raw token is NOT in response
        self.assertNotIn("token", invite_data)
        self.assertNotIn("token_hash", invite_data)

        # Token was sent via SMTP
        token = mock_send.call_args.kwargs["token"]

        # 2. Verify NO record created in users table
        user_exists = self.db.query(User).filter_by(email="recruit@example.com").first()
        self.assertIsNone(user_exists, "User record must NOT be created before registration!")

        # All Users table shows only registered accounts
        users_res = users.list_users(None, None, None, None, None, 1, 25, self.db, self.admin)
        all_emails = [u["email"] for u in users_res["items"]]
        self.assertNotIn("recruit@example.com", all_emails)
        self.assertIn("sysadmin@example.com", all_emails)

        # 3. Candidate validates invitation token
        val_data = auth.validate_invitation(
            InvitationValidateRequest(token=token),
            self.db,
        )
        self.assertTrue(val_data["valid"])
        self.assertEqual(val_data["email"], "recruit@example.com")
        self.assertEqual(val_data["role"], "intern")

        # 4. Candidate registers with profile fields
        reg_data = auth.register_invitation(
            InvitationRegistration(
                token=token,
                full_name="Jane Recruit",
                password="super-secure-password-123",
                password_confirmation="super-secure-password-123",
                department="Engineering",
                mobile="+91 9999988888",
            ),
            self.db,
        )
        self.assertEqual(reg_data["full_name"], "Jane Recruit")
        self.assertEqual(reg_data["email"], "recruit@example.com")
        self.assertEqual(reg_data["role"], "intern")
        self.assertEqual(reg_data["status"], "active")

        # 5. User record and profile now exist in DB
        created_user = self.db.query(User).filter_by(email="recruit@example.com").one()
        self.assertEqual(created_user.role, "intern")
        self.assertEqual(created_user.status, "active")
        profile = self.db.query(StaffProfile).filter_by(user_id=created_user.id).one()
        self.assertEqual(profile.department, "Engineering")
        self.assertEqual(profile.mobile, "+91 9999988888")

        # Invitation status in DB is completed
        inv = self.db.query(UserInvitation).filter_by(id=invite_data["id"]).one()
        self.assertIsNotNone(inv.completed_at)
        self.assertEqual(inv.status, "completed")

        # 6. Reusing consumed token is rejected with 409
        with self.assertRaises(HTTPException) as reused:
            auth.register_invitation(
                InvitationRegistration(
                    token=token,
                    full_name="Jane Clone",
                    password="super-secure-password-123",
                ),
                self.db,
            )
        self.assertEqual(reused.exception.status_code, 409)

        # 7. Newly registered user can log in
        new_login = auth.login(
            LoginRequest(email="recruit@example.com", password="super-secure-password-123"),
            self.db,
        )
        self.assertIn("access_token", new_login)
        self.assertEqual(new_login["role"], "intern")

    def test_smtp_failure_handling(self):
        from app.services.invitation_email import InvitationEmailError
        with patch(
            "app.routers.admin_invitations.send_invitation_email",
            side_effect=InvitationEmailError("SMTP Connection timeout"),
        ):
            with self.assertRaises(HTTPException) as failure:
                admin_invitations.create_invitation(
                    AdminInvitationCreate(email="failed@example.com", role="employee"),
                    self.db,
                    self.admin,
                )
        self.assertEqual(failure.exception.status_code, 502)

        # No user created
        self.assertIsNone(self.db.query(User).filter_by(email="failed@example.com").first())

    def test_token_expiration_and_resend(self):
        with patch("app.routers.admin_invitations.send_invitation_email") as mock_send:
            invite_res = admin_invitations.create_invitation(
                AdminInvitationCreate(email="expire_me@example.com", role="employee"),
                self.db,
                self.admin,
            )
        old_token = mock_send.call_args.kwargs["token"]
        inv_id = invite_res["id"]

        # Expire the invitation in DB
        inv = self.db.query(UserInvitation).filter_by(id=inv_id).one()
        inv.expires_at = utc_now() - timedelta(minutes=1)
        # Reset rate limit timer so resend is allowed
        inv.last_attempt_at = utc_now() - timedelta(seconds=40)
        self.db.commit()

        # Validating expired token returns 410 Gone
        with self.assertRaises(HTTPException) as expired:
            auth.validate_invitation(InvitationValidateRequest(token=old_token), self.db)
        self.assertEqual(expired.exception.status_code, 410)

        # Admin resends invitation
        with patch("app.routers.admin_invitations.send_invitation_email") as mock_resend:
            resend_res = admin_invitations.resend_invitation(inv_id, self.db, self.admin)
        new_token = mock_resend.call_args.kwargs["token"]
        self.assertNotEqual(old_token, new_token)
        self.assertEqual(
            ensure_utc(resend_res["expires_at"]) - ensure_utc(resend_res["sent_at"]),
            timedelta(minutes=5),
        )

        # Old token fails registration
        with self.assertRaises(HTTPException) as old_reg:
            auth.register_invitation(
                InvitationRegistration(token=old_token, full_name="Old", password="password-12345678"),
                self.db,
            )
        self.assertEqual(old_reg.exception.status_code, 400)

        # New token succeeds
        new_reg = auth.register_invitation(
            InvitationRegistration(token=new_token, full_name="New Valid", password="password-12345678"),
            self.db,
        )
        self.assertEqual(new_reg["role"], "employee")


if __name__ == "__main__":
    unittest.main()
