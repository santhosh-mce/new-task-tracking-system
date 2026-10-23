import { useEffect, useRef } from "react";
import {
  Bell,
  Briefcase,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  User,
  X,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import "./EmployeeSidebar.css";

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
        className={`taskflow-sidebar-backdrop${open ? " is-visible" : ""}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        ref={sidebarRef}
        className={`taskflow-sidebar${open ? " is-open" : ""}`}
        aria-label="Staff sidebar"
      >
        {/* Brand Header */}
        <div className="taskflow-sidebar-header">
          <Link
            to="/dashboard"
            className="taskflow-sidebar-brand"
            onClick={() => {
              onSelectView("dashboard");
              if (onClose) onClose();
            }}
          >
            <div className="taskflow-brand-logo-icon">
              <span>TF</span>
            </div>
            <span className="taskflow-brand-title">Ingage TaskFlow</span>
          </Link>

          <button
            ref={closeButtonRef}
            type="button"
            className="taskflow-sidebar-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation List */}
        <nav className="taskflow-sidebar-nav" aria-label="Staff navigation">
          <ul className="taskflow-nav-list">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                location.pathname === "/dashboard" && activeView === item.id;
              return (
                <li key={item.id} className="taskflow-nav-item">
                  <button
                    type="button"
                    className={`taskflow-nav-btn${isActive ? " is-active" : ""}`}
                    onClick={() => {
                      onSelectView(item.id);
                      if (onClose) onClose();
                    }}
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}

            {/* Notifications Link */}
            <li className="taskflow-nav-item">
              <Link
                to="/notifications"
                className={`taskflow-nav-btn${
                  location.pathname === "/notifications" ? " is-active" : ""
                }`}
                onClick={onClose}
              >
                <Bell size={19} aria-hidden="true" />
                <span>Notifications</span>
              </Link>
            </li>

            {/* My Profile Link */}
            <li className="taskflow-nav-item">
              <Link
                to="/profile"
                className={`taskflow-nav-btn${
                  location.pathname === "/profile" ||
                  location.pathname === "/complete-profile"
                    ? " is-active"
                    : ""
                }`}
                onClick={onClose}
              >
                <User size={19} aria-hidden="true" />
                <span>My Profile</span>
              </Link>
            </li>

            {/* Logout Nav Item */}
            <li className="taskflow-nav-item">
              <button
                type="button"
                className="taskflow-nav-btn taskflow-logout-btn"
                onClick={onLogout}
              >
                <LogOut size={19} aria-hidden="true" />
                <span>Logout</span>
              </button>
            </li>
          </ul>
        </nav>

        {/* Brand Footer matching reference */}
        <div className="taskflow-sidebar-footer">
          <div className="taskflow-footer-brand">
            <div className="taskflow-brand-logo-icon taskflow-footer-logo-icon">
              <span>TF</span>
            </div>
            <div className="taskflow-footer-texts">
              <strong>Ingage TaskFlow</strong>
              <small>Work Smarter, Grow Together</small>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
