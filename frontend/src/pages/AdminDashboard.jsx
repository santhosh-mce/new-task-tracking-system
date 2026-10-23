import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarCheck2,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api.js";
import {
  ProjectsOverviewSection,
  StaffDirectorySection,
  AdminDetailModal,
} from "../components/AdminDashboardModals.jsx";
import { useAuth } from "../context/useAuth.js";
import "./AdminDashboard.css";

function formatDate(date) {
  if (!date) return "Select a date";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function localDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const basePath = user?.role === "manager" ? "/manager" : "/admin";
  const [selectedDate, setSelectedDate] = useState(localDateValue);
  const [overview, setOverview] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  // Expanded inline overview directly below the three cards: 'projects' | 'employees' | 'interns' | null
  const [expandedOverview, setExpandedOverview] = useState(null);

  // Detail popup navigation stack: array of { type: 'project' | 'user', id: number }
  const [modalStack, setModalStack] = useState([]);

  function handleToggleCard(cardKey) {
    setExpandedOverview((prev) => (prev === cardKey ? null : cardKey));
  }

  function handleToggleProject(projectId) {
    setModalStack((prev) => {
      const current = prev[prev.length - 1];
      if (current?.type === "project" && current?.id === projectId) {
        return []; // Clicking same project toggles/closes popup!
      }
      return [{ type: "project", id: projectId }]; // Clicking different project switches popup!
    });
  }

  function handleToggleUser(userId) {
    setModalStack((prev) => {
      const current = prev[prev.length - 1];
      if (current?.type === "user" && current?.id === userId) {
        return []; // Clicking same employee/intern toggles/closes popup!
      }
      return [{ type: "user", id: userId }]; // Clicking different employee/intern switches popup!
    });
  }

  function handleCloseModal() {
    setModalStack([]);
  }

  function handleBackModal() {
    setModalStack((prev) => (prev.length > 1 ? prev.slice(0, prev.length - 1) : []));
  }

  function handlePushModal(item) {
    setModalStack((prev) => [...prev, item]);
  }

  const currentModalItem = modalStack[modalStack.length - 1];
  const activeProjectId = currentModalItem?.type === "project" ? currentModalItem.id : null;
  const activeUserId = currentModalItem?.type === "user" ? currentModalItem.id : null;

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const [overviewResponse, projectsResponse] = await Promise.all([
          api.get("/api/dashboard/overview"),
          api.get("/api/projects", { params: { page: 1, page_size: 5 } }),
        ]);
        if (!cancelled) {
          setOverview(overviewResponse.data);
          setProjects(projectsResponse.data.items);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError.response?.data?.detail
              || "Unable to load workspace data right now.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOverview();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  useEffect(() => {
    let cancelled = false;

    async function loadAttendance() {
      setAttendanceLoading(true);
      try {
        const response = await api.get("/api/attendance/admin/summary", {
          params: { date: selectedDate },
        });
        if (!cancelled) {
          setAttendanceSummary(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load attendance summary:", err);
          setAttendanceSummary(null);
        }
      } finally {
        if (!cancelled) setAttendanceLoading(false);
      }
    }

    loadAttendance();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, retry]);

  return (
    <div className="admin-dashboard-page">
      <section className="admin-page-intro">
        <div>
          <p className="admin-page-eyebrow">Workspace overview</p>
          <h1>Dashboard</h1>
          <p>Keep track of the workspace without losing sight of the people doing the work.</p>
        </div>
        <label className="admin-date-control">
          <span>View date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
      </section>

      {error && (
        <div className="admin-data-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError("");
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* 1. Three Summary Cards with Toggleable Inline Expansion */}
      <section className="admin-stat-grid" aria-label="Workspace summary">
        <button
          type="button"
          className={`admin-stat-card ${expandedOverview === "projects" ? "admin-stat-selected" : ""}`}
          onClick={() => handleToggleCard("projects")}
          aria-expanded={expandedOverview === "projects"}
        >
          <span className="admin-stat-icon">
            <BriefcaseBusiness size={19} />
          </span>
          <span className="admin-stat-label">Total projects</span>
          <strong className="admin-stat-value">
            {loading ? "…" : error ? "—" : overview?.total_projects ?? 0}
          </strong>
          <small>
            {expandedOverview === "projects" ? "Click to collapse overview" : "Click to view Projects Overview"}
          </small>
        </button>

        <button
          type="button"
          className={`admin-stat-card ${expandedOverview === "employees" ? "admin-stat-selected" : ""}`}
          onClick={() => handleToggleCard("employees")}
          aria-expanded={expandedOverview === "employees"}
        >
          <span className="admin-stat-icon">
            <Users size={19} />
          </span>
          <span className="admin-stat-label">Employees</span>
          <strong className="admin-stat-value">
            {loading ? "…" : error ? "—" : overview?.employees ?? 0}
          </strong>
          <small>
            {loading
              ? "Loading counts…"
              : `${overview?.employees_active ?? 0} active · ${
                  expandedOverview === "employees" ? "Click to collapse" : "Click to view overview"
                }`}
          </small>
        </button>

        <button
          type="button"
          className={`admin-stat-card ${expandedOverview === "interns" ? "admin-stat-selected" : ""}`}
          onClick={() => handleToggleCard("interns")}
          aria-expanded={expandedOverview === "interns"}
        >
          <span className="admin-stat-icon">
            <Users size={19} />
          </span>
          <span className="admin-stat-label">Interns</span>
          <strong className="admin-stat-value">
            {loading ? "…" : error ? "—" : overview?.interns ?? 0}
          </strong>
          <small>
            {loading
              ? "Loading counts…"
              : `${overview?.interns_active ?? 0} active · ${
                  expandedOverview === "interns" ? "Click to collapse" : "Click to view overview"
                }`}
          </small>
        </button>
      </section>

      {/* 2. Inline Expandable Overview Section Directly Below the Three Cards */}
      {expandedOverview === "projects" && (
        <ProjectsOverviewSection
          activeProjectId={activeProjectId}
          onToggleProject={handleToggleProject}
          onCollapse={() => setExpandedOverview(null)}
        />
      )}

      {expandedOverview === "employees" && (
        <StaffDirectorySection
          category="Employee"
          totalCount={overview?.employees ?? 0}
          activeCount={overview?.employees_active ?? 0}
          activeUserId={activeUserId}
          onToggleUser={handleToggleUser}
          onCollapse={() => setExpandedOverview(null)}
        />
      )}

      {expandedOverview === "interns" && (
        <StaffDirectorySection
          category="Intern"
          totalCount={overview?.interns ?? 0}
          activeCount={overview?.interns_active ?? 0}
          activeUserId={activeUserId}
          onToggleUser={handleToggleUser}
          onCollapse={() => setExpandedOverview(null)}
        />
      )}

      {/* 3. Portfolio, Attendance & Accounts Sections */}
      <section className="admin-dashboard-panels">
        {/* Portfolio / Project overview section */}
        <article className="admin-dashboard-panel project-overview-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-page-eyebrow">Portfolio</p>
              <h2>Project overview</h2>
            </div>
            <button
              type="button"
              className="admin-panel-icon project-panel-link"
              onClick={() => handleToggleCard("projects")}
              aria-label="Toggle projects overview table"
              style={{ border: "none", cursor: "pointer" }}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          {loading && (
            <p className="dashboard-project-message" role="status">
              Loading projects…
            </p>
          )}
          {!loading && !error && projects.length === 0 && (
            <div className="admin-empty-state">
              <span className="admin-empty-icon">
                <BriefcaseBusiness size={22} />
              </span>
              <strong>No projects found</strong>
              <p>No project records are available for this account.</p>
            </div>
          )}
          {!loading && !error && projects.length > 0 && (
            <ul className="dashboard-project-list">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="portfolio-project-button"
                    onClick={() => handleToggleProject(project.id)}
                    title="Click to toggle Project Details popup"
                  >
                    <div>
                      <strong>{project.name}</strong>
                      <span>
                        {project.department} · {project.status}
                      </span>
                    </div>
                    <small>
                      {project.tasks_total
                        ? `${project.completion_percent}% complete`
                        : "No tasks yet"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </article>

        {/* Daily snapshot / Attendance section */}
        <article className="admin-dashboard-panel attendance-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-page-eyebrow">Daily snapshot</p>
              <h2>Attendance</h2>
            </div>
            <span className="admin-panel-icon">
              <CalendarCheck2 size={18} />
            </span>
          </div>
          <p className="attendance-selected-date">{formatDate(selectedDate)}</p>
          {attendanceLoading ? (
            <div className="attendance-unavailable" style={{ textAlign: "center", padding: "1.5rem 0" }}>
              <span>Loading attendance data...</span>
            </div>
          ) : attendanceSummary ? (
            <div className="admin-attendance-snapshot">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", margin: "0.85rem 0" }}>
                <div style={{ background: "var(--taskflow-surface-elevated, #f8fafc)", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--taskflow-border, #e2e8f0)", textAlign: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--taskflow-text-muted)", display: "block" }}>Present</span>
                  <strong style={{ fontSize: "1.15rem", color: "#16a34a" }}>{attendanceSummary.present_count}</strong>
                </div>
                <div style={{ background: "var(--taskflow-surface-elevated, #f8fafc)", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--taskflow-border, #e2e8f0)", textAlign: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--taskflow-text-muted)", display: "block" }}>Late</span>
                  <strong style={{ fontSize: "1.15rem", color: "#d97706" }}>{attendanceSummary.late_count}</strong>
                </div>
                <div style={{ background: "var(--taskflow-surface-elevated, #f8fafc)", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--taskflow-border, #e2e8f0)", textAlign: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--taskflow-text-muted)", display: "block" }}>On Break</span>
                  <strong style={{ fontSize: "1.15rem", color: "#2563eb" }}>{attendanceSummary.on_break_count}</strong>
                </div>
                <div style={{ background: "var(--taskflow-surface-elevated, #f8fafc)", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--taskflow-border, #e2e8f0)", textAlign: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--taskflow-text-muted)", display: "block" }}>Pending</span>
                  <strong style={{ fontSize: "1.15rem", color: "#64748b" }}>{attendanceSummary.not_checked_in_count}</strong>
                </div>
                <div style={{ background: "var(--taskflow-surface-elevated, #f8fafc)", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--taskflow-border, #e2e8f0)", textAlign: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--taskflow-text-muted)", display: "block" }}>Absent</span>
                  <strong style={{ fontSize: "1.15rem", color: "#dc2626" }}>{attendanceSummary.absent_count}</strong>
                </div>
                <div style={{ background: "var(--taskflow-surface-elevated, #f8fafc)", padding: "0.6rem", borderRadius: "8px", border: "1px solid var(--taskflow-border, #e2e8f0)", textAlign: "center" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--taskflow-text-muted)", display: "block" }}>Total Staff</span>
                  <strong style={{ fontSize: "1.15rem", color: "var(--taskflow-text-primary, #0f172a)" }}>{attendanceSummary.total_staff}</strong>
                </div>
              </div>
              <div style={{ marginTop: "1rem" }}>
                <Link to={`${basePath}/attendance`} className="taskflow-btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", textDecoration: "none", padding: "0.45rem 0.85rem", borderRadius: "6px" }}>
                  <span>View Attendance & Breaks</span>
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="attendance-unavailable">
              <span>Attendance records are not available.</span>
              <small>Unable to retrieve attendance data for this workspace.</small>
            </div>
          )}
        </article>
      </section>

      {/* Workspace accounts section */}
      <section className="admin-dashboard-footer-card">
        <div>
          <span className="admin-footer-card-icon">
            <Users size={18} />
          </span>
          <span>
            <strong>Workspace accounts</strong>
            <small>
              {loading
                ? "Loading profile counts…"
                : `${(overview?.employees ?? 0) + (overview?.interns ?? 0)} employee and intern profiles`}
            </small>
          </span>
        </div>
        <Link to={`${basePath}/staff`}>
          Browse staff directory <ArrowUpRight size={16} />
        </Link>
      </section>

      {/* 4. Project Details and Staff Profile Popup Modal */}
      <AdminDetailModal
        modalStack={modalStack}
        onClose={handleCloseModal}
        onBack={handleBackModal}
        onPush={handlePushModal}
      />
    </div>
  );
}
