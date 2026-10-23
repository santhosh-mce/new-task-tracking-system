import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AdminSidebar from "../components/AdminSidebar";
import { useAuth } from "../context/useAuth.js";
import "./AdminLayout.css";

const routeTitles = {
  "/admin": "Dashboard",
  "/admin/users": "User Management",
  "/admin/projects": "Projects",
  "/admin/projects/new": "Add New Project",
  "/admin/tasks": "Tasks & Assignments",
  "/admin/tasks/my-tasks": "My Tasks",
  "/admin/tasks/assign": "Team Tasks",
  "/admin/attendance": "Attendance & Breaks",
  "/admin/reports": "Reports & Analytics",
  "/admin/settings": "Settings",
};


export default function AdminLayout() {
  const { user, clearAuth } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const normalizedPath = location.pathname.replace(/^\/manager/, "/admin");
  let pageTitle = routeTitles[normalizedPath];
  if (!pageTitle) {
    if (normalizedPath.endsWith("/edit")) pageTitle = "Edit Project";
    else if (normalizedPath.startsWith("/admin/projects/")) pageTitle = "Project Details";
    else pageTitle = "Staff Directory";
  }

  useEffect(() => {
    if (!drawerOpen) return undefined;
    function handleEscape(event) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [drawerOpen]);

  function handleLogout() {
    setDrawerOpen(false);
    clearAuth();
    navigate("/", { replace: true });
  }

  return (
    <div className="admin-app-shell">
      <AdminSidebar
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onLogout={handleLogout}
      />
      <div className="admin-main-column">
        <header className="admin-topbar">
          <button
            className="admin-menu-toggle"
            type="button"
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="admin-topbar-title">
            <span>TaskFlow <i>·</i> {user?.role === "manager" ? "Manager" : "Admin"}</span>
            <strong>{pageTitle}</strong>
          </div>
          <div className="admin-user-identity">
            <span className="admin-user-avatar" aria-hidden="true">
              {(user?.full_name || "A").trim().charAt(0).toUpperCase()}
            </span>
            <span>
              <strong>{user?.full_name || "Administrator"}</strong>
              <small>{user?.role === "manager" ? "Manager" : "Administrator"}</small>
            </span>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
