import unittest
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi import HTTPException

from app.database import Base
from app.models.user import User
from app.models.staff_profile import StaffProfile, StaffCategory
from app.models.project import Project, ProjectMember, ProjectDepartment, ProjectStatus
from app.models.task import Task, TaskAssignment
from app.models.attendance import (
    AttendancePolicy,
    DailyAttendance,
    AttendanceSession,
    AttendanceBreak,
    AttendanceCorrection,
    UserLeave,
)
from app.services.attendance_service import (
    check_in_user,
    check_out_user,
    start_break,
    end_break,
    get_today_live_status,
    get_dashboard_summary,
    get_daily_records_table,
    get_monthly_staff_report,
    get_default_policy,
    utc_now,
    to_business_date,
    local_now,
)
from app.routers.attendance import (
    check_in,
    check_out,
    handle_start_break,
    handle_end_break,
    get_today_status,
    get_my_history,
    request_correction,
    list_corrections,
    review_correction,
    get_admin_summary,
    list_admin_records,
    get_admin_monthly_report,
    get_policy,
    update_policy,
)
from app.schemas.attendance import (
    BreakStartRequest,
    CheckInRequest,
    CheckOutRequest,
    CorrectionCreateRequest,
    CorrectionReviewRequest,
    AttendancePolicyUpdate,
)


class AttendanceWorkflowTestCase(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed default policy
        self.policy = AttendancePolicy(
            id=1,
            company_name="Ingage",
            shift_start_time=time(9, 30),
            grace_period_minutes=15,
            expected_daily_hours=Decimal("8.00"),
            cutoff_time=time(14, 0),
            timezone="Asia/Kolkata",
            deduct_lunch_break=True,
            deduct_tea_break=False,
            deduct_personal_break=True,
            deduct_short_break=False,
            max_break_minutes=60,
            updated_at=utc_now(),
        )
        self.db.add(self.policy)

        # Users
        self.admin = User(
            id=1,
            email="admin@ingage.com",
            full_name="Admin Boss",
            role="admin",
            password_hash="fake",
            status="active",
        )
        self.manager = User(
            id=2,
            email="manager@ingage.com",
            full_name="Team Manager",
            role="manager",
            password_hash="fake",
            status="active",
        )
        self.employee1 = User(
            id=3,
            email="emp1@ingage.com",
            full_name="Alice Employee",
            role="employee",
            password_hash="fake",
            status="active",
        )
        self.employee2 = User(
            id=4,
            email="emp2@ingage.com",
            full_name="Bob Employee",
            role="employee",
            password_hash="fake",
            status="active",
        )
        self.unrelated_emp = User(
            id=5,
            email="other@ingage.com",
            full_name="Other Org Employee",
            role="employee",
            password_hash="fake",
            status="active",
        )
        self.db.add_all([self.admin, self.manager, self.employee1, self.employee2, self.unrelated_emp])
        self.db.flush()

        # Staff Profiles
        self.db.add(StaffProfile(user_id=self.employee1.id, department="Ingage", reporting_manager_id=self.manager.id))
        self.db.add(StaffProfile(user_id=self.employee2.id, department="Rezov", reporting_manager_id=self.manager.id))
        self.db.add(StaffProfile(user_id=self.unrelated_emp.id, department="External"))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    def test_check_in_and_idempotency(self):
        # 1. First check-in creates session and daily attendance
        sess1, daily = check_in_user(self.db, self.employee1, source="web_login")
        self.assertIsNotNone(sess1.id)
        self.assertIsNone(sess1.check_out)
        self.assertEqual(sess1.user_id, self.employee1.id)
        self.assertEqual(sess1.source, "web_login")
        self.assertIn(daily.status, ("Present", "Late"))

        # 2. Repeated check-in (duplicate click / retry) does NOT create duplicate session
        sess2, daily2 = check_in_user(self.db, self.employee1, source="manual")
        self.assertEqual(sess1.id, sess2.id)

        all_sessions = (
            self.db.query(AttendanceSession)
            .filter(AttendanceSession.user_id == self.employee1.id)
            .all()
        )
        self.assertEqual(len(all_sessions), 1)

    def test_multiple_sessions_per_day(self):
        # Session 1: Check in morning
        sess1, daily = check_in_user(self.db, self.employee1)
        # Fast-forward 120 minutes (2 hours)
        sess1.check_in = utc_now() - timedelta(minutes=150)
        sess1.check_out = utc_now() - timedelta(minutes=30)
        sess1.duration_minutes = 120
        self.db.commit()

        # Session 2: Check in afternoon
        sess2, daily = check_in_user(self.db, self.employee1)
        self.assertNotEqual(sess1.id, sess2.id)
        self.assertIsNone(sess2.check_out)

        # Checkout afternoon session
        closed_sess, daily = check_out_user(self.db, self.employee1)
        self.assertEqual(closed_sess.id, sess2.id)
        self.assertIsNotNone(closed_sess.check_out)

        # Confirm 2 completed sessions
        all_sessions = (
            self.db.query(AttendanceSession)
            .filter(AttendanceSession.user_id == self.employee1.id)
            .all()
        )
        self.assertEqual(len(all_sessions), 2)
        for s in all_sessions:
            self.assertIsNotNone(s.check_out)

    def test_break_tracking_and_policy_deduction(self):
        # 1. Cannot take break without check in
        with self.assertRaises(HTTPException) as ctx:
            start_break(self.db, self.employee1, break_type="Lunch")
        self.assertEqual(ctx.exception.status_code, 400)

        # 2. Check in
        check_in_user(self.db, self.employee1)

        # 3. Start Lunch break (Lunch is policy-deducted)
        brk1 = start_break(self.db, self.employee1, break_type="Lunch", reason="Meal time")
        self.assertIsNotNone(brk1.id)
        self.assertTrue(brk1.is_deducted)
        self.assertIsNone(brk1.end_time)

        # Duplicate click returns same break (idempotent)
        brk_dup = start_break(self.db, self.employee1, break_type="Lunch")
        self.assertEqual(brk1.id, brk_dup.id)

        # 4. End Lunch break
        brk1.start_time = utc_now() - timedelta(minutes=45)
        ended_brk = end_break(self.db, self.employee1)
        self.assertEqual(ended_brk.id, brk1.id)
        self.assertIsNotNone(ended_brk.end_time)
        self.assertEqual(ended_brk.duration_minutes, 45)

        # 5. Start Tea break (Tea is not deducted per policy)
        brk2 = start_break(self.db, self.employee1, break_type="Tea")
        self.assertFalse(brk2.is_deducted)
        brk2.start_time = utc_now() - timedelta(minutes=15)
        end_break(self.db, self.employee1)

        # Check today live status
        status = get_today_live_status(self.db, self.employee1)
        self.assertEqual(len(status.breaks), 2)
        self.assertEqual(status.total_break_minutes, 60)

    def test_checkout_auto_closes_open_break(self):
        check_in_user(self.db, self.employee1)
        brk = start_break(self.db, self.employee1, break_type="Personal")
        self.assertIsNone(brk.end_time)

        # Check out
        check_out_user(self.db, self.employee1)

        # Confirm break was automatically closed
        self.db.refresh(brk)
        self.assertIsNotNone(brk.end_time)
        self.assertGreaterEqual(brk.duration_minutes, 0)

    def test_dashboard_summary_and_cutoff_logic(self):
        today = local_now(self.policy).date()

        # emp1 checks in
        check_in_user(self.db, self.employee1)

        # emp2 has approved leave
        self.db.add(UserLeave(user_id=self.employee2.id, leave_date=today, leave_type="Casual Leave", status="Approved"))
        self.db.commit()

        # Admin summary
        summary = get_dashboard_summary(self.db, self.admin, today)
        self.assertEqual(summary.total_staff, 5)
        self.assertEqual(summary.present_count + summary.late_count, 1)
        self.assertEqual(summary.on_leave_count, 1)

        # Before cutoff, un-checked in users are "Not Checked In", not marked Absent!
        with patch("app.services.attendance_service.local_now") as mock_now:
            # 10:00 AM local time (before 14:00 cutoff)
            mock_now.return_value = datetime(today.year, today.month, today.day, 10, 0, tzinfo=timezone.utc)
            summary_before = get_dashboard_summary(self.db, self.admin, today)
            self.assertEqual(summary_before.absent_count, 0)
            self.assertGreater(summary_before.not_checked_in_count, 0)

            # 15:00 local time (after 14:00 cutoff)
            mock_now.return_value = datetime(today.year, today.month, today.day, 15, 0, tzinfo=timezone.utc)
            summary_after = get_dashboard_summary(self.db, self.admin, today)
            self.assertGreater(summary_after.absent_count, 0)

    def test_manager_scoped_authorization(self):
        today = local_now(self.policy).date()
        check_in_user(self.db, self.employee1)
        check_in_user(self.db, self.unrelated_emp)

        # Manager summary should only include manager and reporting employees (emp1, emp2, manager)
        mgr_summary = get_dashboard_summary(self.db, self.manager, today)
        self.assertEqual(mgr_summary.total_staff, 3)

        # Records table
        mgr_records = get_daily_records_table(self.db, self.manager, today)
        mgr_user_ids = {r.user_id for r in mgr_records}
        self.assertIn(self.employee1.id, mgr_user_ids)
        self.assertIn(self.employee2.id, mgr_user_ids)
        self.assertIn(self.manager.id, mgr_user_ids)
        self.assertNotIn(self.unrelated_emp.id, mgr_user_ids)

    def test_attendance_correction_workflow(self):
        past_date = local_now(self.policy).date() - timedelta(days=2)
        req_in = datetime(past_date.year, past_date.month, past_date.day, 4, 0, tzinfo=timezone.utc)
        req_out = datetime(past_date.year, past_date.month, past_date.day, 12, 30, tzinfo=timezone.utc)

        # 1. Employee submits correction request
        payload = CorrectionCreateRequest(
            request_date=past_date,
            requested_check_in=req_in,
            requested_check_out=req_out,
            requested_break_minutes=45,
            reason="Network outage prevented portal check-in",
        )
        corr_resp = request_correction(payload, self.db, self.employee1)
        self.assertEqual(corr_resp.status, "Pending")
        self.assertEqual(corr_resp.user_id, self.employee1.id)

        # 2. Manager reviews and approves correction for their team member
        review_payload = CorrectionReviewRequest(
            action="approve",
            reviewer_remarks="Verified with office punch card. Approved.",
        )
        approved = review_correction(corr_resp.id, review_payload, self.db, self.manager)
        self.assertEqual(approved.status, "Approved")
        self.assertEqual(approved.reviewer_name, self.manager.full_name)

        # 3. Confirm daily attendance record was updated
        daily = (
            self.db.query(DailyAttendance)
            .filter(DailyAttendance.user_id == self.employee1.id, DailyAttendance.date == past_date)
            .first()
        )
        self.assertIsNotNone(daily)
        self.assertEqual(daily.status, "Present")
        self.assertGreater(daily.net_work_minutes, 0)

    def test_policy_management_restricted_to_admin(self):
        # Admin can update policy
        update_data = AttendancePolicyUpdate(
            shift_start_time="10:00",
            grace_period_minutes=20,
            expected_daily_hours=8.5,
        )
        updated_policy = update_policy(update_data, self.db, self.admin)
        self.assertEqual(updated_policy.shift_start_time, "10:00")
        self.assertEqual(updated_policy.grace_period_minutes, 20)
        self.assertEqual(updated_policy.expected_daily_hours, 8.5)


if __name__ == "__main__":
    unittest.main()
