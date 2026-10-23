import sys
import unittest
import urllib.request
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from app.models import User
from app.security import create_access_token, hash_password
from app.services.notification_service import create_notification


class TestNotificationsAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = SessionLocal()
        cls.admin = cls.db.query(User).filter(User.role == "admin").first()
        if not cls.admin:
            cls.admin = User(
                email="admin_test_api@ingage.com",
                full_name="Admin Test",
                role="admin",
                status="active",
                password_hash=hash_password("adminSecret123"),
            )
            cls.db.add(cls.admin)
            cls.db.commit()

        cls.emp = cls.db.query(User).filter(User.email == "emp_test_api@ingage.com").first()
        if not cls.emp:
            cls.emp = User(
                email="emp_test_api@ingage.com",
                full_name="Emp Test",
                role="employee",
                status="active",
                password_hash=hash_password("empSecret123"),
            )
            cls.db.add(cls.emp)
            cls.db.commit()

        cls.admin_token = create_access_token(cls.admin.id, cls.admin.role)
        cls.emp_token = create_access_token(cls.emp.id, cls.emp.role)
        cls.base_url = "http://127.0.0.1:8000"

    @classmethod
    def tearDownClass(cls):
        cls.db.query(User).filter(User.email == "emp_test_api@ingage.com").delete(synchronize_session=False)
        cls.db.commit()
        cls.db.close()

    def _req(self, path, token, method="GET", body=None):
        url = f"{self.base_url}{path}"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                content = resp.read().decode("utf-8")
                return resp.status, json.loads(content) if content else {}
        except urllib.error.HTTPError as e:
            content = e.read().decode("utf-8")
            return e.code, json.loads(content) if content else {}

    def test_01_unread_count_and_list(self):
        # Create notif for employee
        notif = create_notification(
            db=self.db,
            user_id=self.emp.id,
            title="API Test Notification",
            message="Testing API endpoints",
            notification_type="task",
        )
        self.db.commit()

        status, data = self._req("/api/notifications/unread-count", self.emp_token)
        self.assertEqual(status, 200)
        self.assertGreaterEqual(data.get("unread_count", 0), 1)

        status, data = self._req("/api/notifications", self.emp_token)
        self.assertEqual(status, 200)
        self.assertTrue(any(n["id"] == notif.id for n in data.get("items", [])))

    def test_02_recipient_isolation(self):
        # Admin creates notif for admin
        admin_notif = create_notification(
            db=self.db,
            user_id=self.admin.id,
            title="Private Admin Notif",
            message="Only admin can see this",
            notification_type="general",
        )
        self.db.commit()

        # Employee requests notifications
        status, data = self._req("/api/notifications", self.emp_token)
        self.assertEqual(status, 200)
        emp_notif_ids = [n["id"] for n in data.get("items", [])]
        self.assertNotIn(admin_notif.id, emp_notif_ids, "Employee MUST NOT see admin notifications")

        # Employee attempts to mark admin notif as read
        patch_status, patch_data = self._req(
            f"/api/notifications/{admin_notif.id}/read",
            self.emp_token,
            method="PATCH",
        )
        self.assertEqual(patch_status, 404, "Employee cannot mark another user's notification as read")

    def test_03_mark_read_and_read_all(self):
        n = create_notification(
            db=self.db,
            user_id=self.emp.id,
            title="To be marked read",
            message="Read me",
            notification_type="task",
        )
        self.db.commit()

        patch_status, patch_data = self._req(
            f"/api/notifications/{n.id}/read",
            self.emp_token,
            method="PATCH",
        )
        self.assertEqual(patch_status, 200)
        self.assertTrue(patch_data.get("is_read"))

        # Mark all read
        post_status, post_data = self._req(
            "/api/notifications/read-all",
            self.emp_token,
            method="POST",
            body={},
        )
        self.assertEqual(post_status, 200)

        # Confirm unread count is 0
        status, count_data = self._req("/api/notifications/unread-count", self.emp_token)
        self.assertEqual(count_data.get("unread_count"), 0)


if __name__ == "__main__":
    unittest.main()
