import { useLocation } from "react-router-dom";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  Settings,
  UserRoundCog,
} from "lucide-react";
import "./AdminPlaceholder.css";

const pageContent = {
  "/admin/projects": {
    icon: BriefcaseBusiness,
    eyebrow: "Project workspace",
    title: "Projects",
    description: "Project records, managers, teams, and delivery dates belong here.",
    sections: [
      ["Project creation", "Create and manage projects when project services are connected."],
      ["Managers & teams", "Project manager and team membership records are not available yet."],
      ["Project progress", "Progress summaries will use real project data when available."],
    ],
  },
  "/admin/tasks": {
    icon: ClipboardList,
    eyebrow: "Work coordination",
    title: "Tasks & Assignments",
    description: "Keep individual and group assignments visible to the people responsible.",
    sections: [
      ["Individual & group work", "Task assignment data is not connected."],
      ["Reviews & status", "Pending reviews and task statuses will appear when a task service is available."],
      ["Admin · My Tasks", "Your personal admin task list is not available yet."],
    ],
  },
  "/admin/calendar": {
    icon: CalendarDays,
    eyebrow: "Dates & deadlines",
    title: "Calendar",
    description: "A date-wise view for tasks, deadlines, and attendance.",
    sections: [
      ["Tasks & deadlines", "Calendar task data is not connected."],
      ["Attendance", "Attendance events are not available from the current API."],
      ["Date navigation", "Calendar entries will appear here when connected data is available."],
    ],
  },
  "/admin/reports": {
    icon: BarChart3,
    eyebrow: "Workspace insights",
    title: "Reports & Analytics",
    description: "Reports should reflect actual workspace activity, not estimates.",
    sections: [
      ["Progress & completion", "Project and task data is not connected."],
      ["Productivity", "No productivity metrics are available from the current API."],
      ["Attendance trends", "Attendance reporting is not configured."],
    ],
  },
  "/admin/notifications": {
    icon: Bell,
    eyebrow: "Updates",
    title: "Notifications",
    description: "Workspace notifications will be shown here when a notification service is connected.",
    sections: [
      ["Assignments & reviews", "No notification feed is available."],
      ["Break alerts", "Long-break alerts are not configured."],
      ["Invitations", "Invitation email delivery is not implemented; no emails are sent."],
    ],
  },
  "/admin/settings": {
    icon: Settings,
    eyebrow: "Workspace preferences",
    title: "Settings",
    description: "Manage profile and company preferences when settings services are available.",
    sections: [
      ["Profile & password", "Profile editing and password updates are not connected."],
      ["Company settings", "Company configuration is not available."],
      ["Working hours & cutoff", "Working-hour and cutoff settings are not configured."],
    ],
  },
};

export default function AdminPlaceholder() {
  const { pathname } = useLocation();
  const page = pageContent[pathname] ?? pageContent["/admin/projects"];
  const Icon = page.icon;

  return (
    <div className="admin-placeholder-page">
      <header className="admin-page-intro">
        <div>
          <p className="admin-page-eyebrow">{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </div>
        <span className="admin-placeholder-main-icon"><Icon size={24} /></span>
      </header>
      <section className="admin-placeholder-grid" aria-label={`${page.title} sections`}>
        {page.sections.map(([title, description], index) => (
          <article className="admin-placeholder-card" key={title}>
            <span className="admin-placeholder-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h2>{title}</h2>
            <p>{description}</p>
            <span className="admin-placeholder-status">Not connected</span>
          </article>
        ))}
      </section>
      <p className="admin-placeholder-note">
        This page is a placeholder. It does not create, change, or report records.
      </p>
    </div>
  );
}
