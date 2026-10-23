import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Settings,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";

export default function AdminSidebar({ open, onClose, onLogout }) {
  const { user } = useAuth();
  const location = useLocation();
  const basePath = user?.role === "manager" ? "/manager" : "/admin";

  const isTasksActive = location.pathname.startsWith(`${basePath}/tasks`);
  const [tasksExpanded, setTasksExpanded] = useState(isTasksActive);

  // Keep expanded if user navigates to tasks
  useEffect(() => {
    if (isTasksActive) {
      setTasksExpanded(true);
    }
  }, [isTasksActive]);

  const navigationItems = [
    { label: "Dashboard", path: basePath, end: true, icon: LayoutDashboard },
    ...(user?.role === "manager"
      ? [
          { label: "Projects", path: "/manager/projects", icon: BriefcaseBusiness },
          { label: "Staff Directory", path: "/manager/staff", icon: Users },
        ]
      : [
          { label: "User Management", path: "/admin/users", icon: Users },
          { label: "Projects", path: "/admin/projects", icon: BriefcaseBusiness },
        ]),
    {
      label: "Tasks & Assignments",
      path: `${basePath}/tasks`,
      icon: ClipboardList,
      children: [
        { label: "My Tasks", path: `${basePath}/tasks/my-tasks` },
        { label: "Team Tasks", path: `${basePath}/tasks/assign` },
      ],
    },
    {
      label: "Attendance & Breaks",
      path: `${basePath}/attendance`,
      icon: UserRoundCog,
    },
    {
      label: "Notifications",
      path: `${basePath}/notifications`,
      icon: Bell,
    },
    ...(user?.role === "manager"
      ? []
      : [
          { label: "Reports & Analytics", path: "/admin/reports", icon: BarChart3 },
          { label: "Settings", path: "/admin/settings", icon: Settings },
        ]),
  ];


  const sidebarRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();

    function trapFocus(event) {
      if (event.key !== "Tab") return;
      const focusable = sidebarRef.current?.querySelectorAll(
        'a[href], button:not([disabled])',
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
      <button
        className={`admin-drawer-backdrop${open ? " is-visible" : ""}`}
        type="button"
        aria-label="Close navigation menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <aside
        ref={sidebarRef}
        className={`admin-sidebar${open ? " is-open" : ""}`}
        aria-label="Admin sidebar"
      >
        <div className="admin-sidebar-brand-row">
          <Link className="admin-brand" to={basePath} onClick={onClose}>
            <span className="admin-brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>TaskFlow <i>·</i> {user?.role === "manager" ? "Manager" : "Admin"}</span>
          </Link>
          <button
            ref={closeButtonRef}
            className="admin-sidebar-close"
            type="button"
            aria-label="Close navigation menu"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>

        <p className="admin-nav-caption">WORKSPACE</p>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            if (item.children) {
              const active = isTasksActive;
              return (
                <div key={item.label} className="admin-nav-group">
                  <button
                    type="button"
                    className={`admin-nav-link admin-nav-link-expandable${
                      active ? " active" : ""
                    }`}
                    onClick={() => setTasksExpanded((prev) => !prev)}
                    aria-expanded={tasksExpanded}
                  >
                    <div>
                      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                      <span>{item.label}</span>
                    </div>
                    <ChevronDown
                      size={15}
                      className={`admin-nav-chevron${tasksExpanded ? " is-open" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {tasksExpanded && (
                    <div className="admin-nav-submenu" role="group" aria-label={item.label}>
                      {item.children.map((child) => (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          onClick={onClose}
                          className={({ isActive }) =>
                            `admin-nav-sublink${isActive ? " active" : ""}`
                          }
                        >
                          <span>{child.label}</span>
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `admin-nav-link${isActive ? " active" : ""}`
                }
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="admin-sidebar-bottom">
          <button
            className="admin-nav-link admin-logout"
            type="button"
            onClick={onLogout}
          >
            <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
