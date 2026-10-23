import { useEffect, useRef } from "react";
import {
  Briefcase,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  User,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import "../layouts/AdminLayout.css";

export default function EmployeeSidebar({
  activeView,
  onSelectView,
  open,
  onClose,
  onLogout,
  user,
}) {
  const location = useLocation();
  const sidebarRef = useRef(null);
  const closeButtonRef = useRef(null);

  const roleLabel = user?.role === "intern" ? "Intern" : "Employee";

  const navigationItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "projects", label: "My Projects", icon: Briefcase },
    { id: "tasks", label: "My Tasks", icon: ClipboardList },
  ];

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();

    function trapFocus(event) {
      if (event.key !== "Tab") return;
      const focusable = sidebarRef.current?.querySelectorAll(
        'a[href], button:not([disabled])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open]);

  return (
    <>
      <div
        className={`admin-backdrop${open ? " is-visible" : ""}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={sidebarRef}
        className={`admin-sidebar${open ? " is-open" : ""}`}
        aria-label="Staff sidebar"
      >
        <div className="admin-sidebar-brand-row">
          <Link to="/dashboard" className="admin-brand" onClick={onClose}>
            <span className="admin-brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>
              TaskFlow <i>·</i> {roleLabel}
            </span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            className="admin-sidebar-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <span className="admin-nav-caption">WORKSPACE MENU</span>
        <nav className="admin-nav" aria-label="Staff navigation">
          <ul className="admin-nav-list">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === "/dashboard" && activeView === item.id;
              return (
                <li key={item.id} className="admin-nav-item">
                  <button
                    type="button"
                    className={`admin-nav-link${isActive ? " is-active" : ""}`}
                    onClick={() => {
                      onSelectView(item.id);
                      if (onClose) onClose();
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: isActive ? "var(--admin-lime, #65a30d)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}

            {/* My Profile Link */}
            <li className="admin-nav-item">
              <Link
                to="/profile"
                className={`admin-nav-link${location.pathname === "/profile" || location.pathname === "/complete-profile" ? " is-active" : ""}`}
                onClick={onClose}
              >
                <User size={18} aria-hidden="true" />
                <span>My Profile</span>
              </Link>
            </li>
          </ul>
        </nav>

        <div className="admin-sidebar-bottom">
          <div className="admin-user-identity" style={{ padding: "12px 10px" }}>
            <span className="admin-user-avatar" aria-hidden="true">
              {(user?.full_name || "U").trim().charAt(0).toUpperCase()}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <strong>{user?.full_name || "User"}</strong>
              <small style={{ textTransform: "capitalize" }}>{roleLabel}</small>
            </span>
          </div>

          <button
            type="button"
            className="admin-logout-btn"
            onClick={onLogout}
            style={{ marginTop: 8 }}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
