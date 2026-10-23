import os
import unittest
from datetime import date
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["SECRET_KEY"] = "test-secret-key-for-first-login-workflow-32chars"

from app.database import Base
from app.dependencies.permissions import require_onboarded_user
from app.models.staff_profile import StaffProfile
from app.models.user import User
from app.routers import admin_invitations, auth, profile
from app.schemas.auth import ChangePasswordRequest, LoginRequest
from app.schemas.invitations import AdminInvitationCreate
from app.schemas.profile import (
    CertificationItem,
    EducationRecordItem,
    LanguageItem,
    ProfileCompletionRequest,
)
from app.security import hash_password


class TestFirstLoginCompleteWorkflow(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed Admin user
        self.admin = User(
            full_name="System Administrator",
            email="admin@ingage.com",
            password_hash=hash_password("AdminSecurePass#2026"),
            role="admin",
            status="active",
            profile_status="complete",
            onboarding_status="completed",
            must_change_password=False,
        )
        self.db.add(self.admin)
        self.db.commit()
        self.db.refresh(self.admin)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    def test_admin_is_never_blocked_by_onboarding_guard(self):
        """Admin accounts are exempt from onboarding gating."""
        user = require_onboarded_user(self.admin)
        self.assertEqual(user.email, "admin@ingage.com")

    def test_full_first_login_workflow_for_employee_intern_and_manager(self):
        """
        Verify the exact workflow for Employee, Intern, and Manager accounts:
        1. Admin creates user with Full Name, Email, Role, Department, Employee/Intern ID.
        2. First login flags must_change_password=True, blocks dashboard access.
        3. Mandatory password change with validation.
        4. Mandatory profile completion with all 4 required sections.
        5. Access unlocked to dashboard only after both steps complete.
        """
        roles_to_test = [
            ("employee", "EMP-0010", "John Employee", "john.emp@example.com"),
            ("intern", "INT-0020", "Priya Intern", "priya.intern@example.com"),
            ("manager", "MGR-0030", "Karthik Manager", "karthik.mgr@example.com"),
        ]

        temp_password = "TempPassword#2026"

        for role, custom_id, full_name, email in roles_to_test:
            with self.subTest(role=role):
                # STEP 1: Admin creates user
                payload = AdminInvitationCreate(
                    full_name=full_name,
                    email=email,
                    role=role,
                    department="Ingage",
                    employee_id=custom_id,
                    temporary_password=temp_password,
                )
                with patch("app.routers.admin_invitations.send_temporary_password_email") as mock_mail:
                    res = admin_invitations.create_invitation(payload, self.db, self.admin)
                    self.assertEqual(res["email"], email)
                    self.assertEqual(res["role"], role)

                created_user = self.db.query(User).filter(User.email == email).first()
                self.assertIsNotNone(created_user)
                self.assertTrue(created_user.must_change_password)
                self.assertEqual(created_user.profile_status, "incomplete")
                self.assertEqual(created_user.onboarding_status, "pending")

                # STEP 2: First Login returns must_change_password=True
                login_res = auth.login(LoginRequest(email=email, password=temp_password), self.db)
                self.assertTrue(login_res["must_change_password"])
                self.assertEqual(login_res["profile_status"], "incomplete")

                # Backend guard blocks access to dashboard / application APIs
                with self.assertRaises(HTTPException) as ctx:
                    require_onboarded_user(created_user)
                self.assertEqual(ctx.exception.status_code, 403)
                self.assertIn("Password reset is required", ctx.exception.detail)

                # STEP 3: Password Change validation
                # 3a. Mismatched passwords
                with self.assertRaises(HTTPException) as ctx:
                    auth.change_password(
                        ChangePasswordRequest(
                            current_password=temp_password,
                            new_password="NewSecurePassword#2026",
                            confirm_password="DifferentPassword#2026",
                        ),
                        self.db,
                        created_user,
                    )
                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("do not match", ctx.exception.detail)

                # 3b. New password same as temporary password
                with self.assertRaises(HTTPException) as ctx:
                    auth.change_password(
                        ChangePasswordRequest(
                            current_password=temp_password,
                            new_password=temp_password,
                            confirm_password=temp_password,
                        ),
                        self.db,
                        created_user,
                    )
                self.assertEqual(ctx.exception.status_code, 400)
                self.assertIn("cannot be the same as your temporary password", ctx.exception.detail)

                # 3c. Successful password change
                new_password = f"PersonalPass@{role.title()}#2026"
                change_res = auth.change_password(
                    ChangePasswordRequest(
                        current_password=temp_password,
                        new_password=new_password,
                        confirm_password=new_password,
                    ),
                    self.db,
                    created_user,
                )
                self.assertFalse(change_res["must_change_password"])
                self.assertEqual(change_res["profile_status"], "incomplete")

                self.db.refresh(created_user)
                self.assertFalse(created_user.must_change_password)
                self.assertEqual(created_user.profile_status, "incomplete")

                # Dashboard access is STILL blocked because profile is incomplete!
                with self.assertRaises(HTTPException) as ctx:
                    require_onboarded_user(created_user)
                self.assertEqual(ctx.exception.status_code, 403)
                self.assertIn("Profile completion is required", ctx.exception.detail)

                # STEP 4: Complete Profile Form
                # 4a. Missing required mobile number fails
                with self.assertRaises(Exception):
                    profile.complete_or_update_profile(
                        ProfileCompletionRequest(
                            full_name=full_name,
                            mobile="",  # empty
                            highest_qualification="B.Tech Computer Science",
                        ),
                        self.db,
                        created_user,
                    )

                # 4b. Missing highest qualification fails
                with self.assertRaises(HTTPException) as ctx:
                    profile.complete_or_update_profile(
                        ProfileCompletionRequest(
                            full_name=full_name,
                            mobile="+91 9876543210",
                            highest_qualification="",
                            education_records=[],
                        ),
                        self.db,
                        created_user,
                    )
                self.assertEqual(ctx.exception.status_code, 422)
                self.assertIn("Highest Qualification is required", ctx.exception.detail)

                # 4c. Successful profile submission with all 4 sections
                profile_payload = ProfileCompletionRequest(
                    # Section A: Personal Information
                    full_name=full_name,
                    mobile="+91 9876543210",
                    profile_photo="/api/users/profile/files/sample_photo.jpg",
                    department="Ingage",
                    dob=date(2000, 1, 15),
                    gender="Male",
                    city="Chennai",
                    state="Tamil Nadu",
                    country="India",
                    # Section B: Education & Qualification (+add)
                    highest_qualification="B.Tech / B.E (Engineering)",
                    education_records=[
                        EducationRecordItem(
                            highest_qualification="B.Tech / B.E (Engineering)",
                            institution="Anna University College of Engineering",
                            university="Anna University",
                            degree="Computer Science and Engineering",
                            passing_year=2024,
                            score="8.8 CGPA",
                            status="Completed",
                        )
                    ],
                    # Section C: Skills & Languages
                    skills=["React", "FastAPI", "Python", "JavaScript"],
                    soft_skills=["Communication", "Teamwork", "Problem Solving"],
                    languages=[
                        LanguageItem(name="English", proficiency="Fluent"),
                        LanguageItem(name="Tamil", proficiency="Native"),
                    ],
                    # Section D: Certifications (+add)
                    certifications=[
                        CertificationItem(
                            name="AWS Certified Solutions Architect",
                            issuer="Amazon Web Services",
                            year="2024",
                            issue_date="2024",
                            certificate_url="https://aws.amazon.com/verification/123",
                            certificate_file="/api/users/profile/files/cert_aws.pdf",
                        )
                    ],
                )

                comp_res = profile.complete_or_update_profile(profile_payload, self.db, created_user)
                self.assertEqual(comp_res.profile_status, "complete")
                self.assertEqual(comp_res.full_name, full_name)
                self.assertEqual(comp_res.mobile, "+91 9876543210")
                self.assertEqual(comp_res.department, "Ingage")
                self.assertEqual(comp_res.staff_id, custom_id)
                self.assertEqual(len(comp_res.education_records), 1)
                self.assertEqual(len(comp_res.languages), 2)
                self.assertEqual(len(comp_res.certifications), 1)

                self.db.refresh(created_user)
                self.assertEqual(created_user.profile_status, "complete")
                self.assertEqual(created_user.onboarding_status, "completed")

                # STEP 5: Backend guard now unlocks and permits access!
                allowed_user = require_onboarded_user(created_user)
                self.assertEqual(allowed_user.id, created_user.id)
                self.assertEqual(allowed_user.email, email)

                # Subsequent logins do NOT require password change or profile completion
                fresh_login = auth.login(LoginRequest(email=email, password=new_password), self.db)
                self.assertFalse(fresh_login["must_change_password"])
                self.assertEqual(fresh_login["profile_status"], "complete")
                self.assertEqual(fresh_login["onboarding_status"], "completed")


if __name__ == "__main__":
    unittest.main()
