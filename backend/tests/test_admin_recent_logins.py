import json
import os
import sys
import unittest
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.models.user import User
from app.models.staff_profile import StaffProfile
from app.models.attendance import AttendanceSession
from app.security import create_access_token
from app.routers.attendance import get_recent_logins


class TestAdminRecentLogins(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.base_url = "http://127.0.0.1:8000"

    def tearDown(self):
        self.db.close()

    def test_direct_function_admin_access_and_schema(self):
        admin = self.db.query(User).filter(User.role == "admin").first()
        self.assertIsNotNone(admin, "Admin user must exist")

        results = get_recent_logins(db=self.db, current_user=admin)
        self.assertIsInstance(results, list)

        for item in results:
            self.assertIn(item.role, ("employee", "intern", "manager", "admin", "team_lead"))
            self.assertIsNotNone(item.user_id)
            self.assertIsNotNone(item.full_name)
            self.assertIsNotNone(item.email)
            self.assertIn(item.login_status, ("Logged in", "Last session", "Never logged in"))

        # Verify ordering: most recent login first
        dates = [item.last_login for item in results if item.last_login]
        for i in range(len(dates) - 1):
            self.assertGreaterEqual(dates[i], dates[i + 1], "Records must be sorted newest first")

    def test_direct_function_search_and_filter(self):
        admin = self.db.query(User).filter(User.role == "admin").first()

        # Search existing staff
        intern = self.db.query(User).filter(User.role == "intern").first()
        if intern and intern.full_name:
            term = intern.full_name.split()[0]
            res = get_recent_logins(q=term, db=self.db, current_user=admin)
            self.assertTrue(any(u.user_id == intern.id for u in res))

        # Search nonexistent
        res_empty = get_recent_logins(q="xyzNonExistentStaffQuery999", db=self.db, current_user=admin)
        self.assertEqual(len(res_empty), 0)

    def test_http_api_permissions_and_response(self):
        admin = self.db.query(User).filter(User.role == "admin").first()
        emp = self.db.query(User).filter(User.role == "employee").first()

        admin_token = create_access_token(admin.id, admin.role)
        emp_token = create_access_token(emp.id, emp.role) if emp else None

        # 1. Non-admin request should get 403 Forbidden
        if emp_token:
            req_emp = urllib.request.Request(
                f"{self.base_url}/api/attendance/admin/recent-logins",
                headers={"Authorization": f"Bearer {emp_token}"},
            )
            try:
                urllib.request.urlopen(req_emp)
                self.fail("Non-admin must not access admin recent logins")
            except urllib.error.HTTPError as e:
                self.assertEqual(e.code, 403)

        # 2. Admin request should get 200 OK
        req_admin = urllib.request.Request(
            f"{self.base_url}/api/attendance/admin/recent-logins",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        with urllib.request.urlopen(req_admin) as response:
            self.assertEqual(response.status, 200)
            data = json.loads(response.read().decode())
            self.assertIsInstance(data, list)
            for item in data:
                self.assertIn(item["role"], ("employee", "intern", "manager", "admin", "team_lead"))
                self.assertIn("user_id", item)
                self.assertIn("full_name", item)
                self.assertIn("staff_id", item)
                self.assertIn("department", item)
                self.assertIn("last_login", item)
                self.assertIn("login_status", item)


if __name__ == "__main__":
    unittest.main()
