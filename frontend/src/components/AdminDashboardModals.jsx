import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChevronUp,
  ExternalLink,
  Search,
  Users,
  X,
} from "lucide-react";
import api from "../api.js";
import AccessibleModal from "./AccessibleModal.jsx";
import "../pages/ProjectDrilldown.css";

const projectStatuses = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];
const departments = ["Ingage", "Rezov", "Edutech"];
const accountStatuses = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Pending activation", value: "invitation_pending" },
];

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  } catch {
    return value;
  }
}

function formatDateTime(value) {
  if (!value) return "Not provided";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getStaffBadgeStyle(str) {
  const s = (str || "").toLowerCase();
  if (s.includes("intern")) {
    return {
      background: "#eff6ff",
      border: "1px solid #bfdbfe",
      color: "#1d4ed8",
    };
  }
  if (s.includes("employee")) {
    return {
      background: "#ecfdf5",
      border: "1px solid #a7f3d0",
      color: "#065f46",
    };
  }
  if (s.includes("manager")) {
    return {
      background: "#faf5ff",
      border: "1px solid #e9d5ff",
      color: "#7e22ce",
    };
  }
  return {
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    color: "#475569",
  };
}

function displayRole(profile) {
  if (!profile) return "Staff";
  if (profile.role === "user" && profile.staff_category) {
    return profile.staff_category;
  }
  return profile.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Staff";
}

function getInitials(name) {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// =========================================================================
// 1. Projects Overview Section (Inline directly underneath the three cards)
// =========================================================================
export function ProjectsOverviewSection({
  activeProjectId,
  onToggleProject,
  onCollapse,
}) {
  const [filters, setFilters] = useState({
    q: "",
    department: "",
    status: "",
    date_from: "",
    date_to: "",
  });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [projects, setProjects] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      setLoading(true);
      setError("");
      const params = { page, page_size: pageSize };
      Object.entries(filters).forEach(([key, val]) => {
        if (val && val.trim()) params[key] = val.trim();
      });

      try {
        const response = await api.get("/api/projects", { params });
        if (!cancelled) {
          setProjects(response.data.items || []);
          setTotal(response.data.total || 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Unable to load projects right now."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProjects();
    return () => {
      cancelled = true;
    };
  }, [filters, page, retry]);

  function updateFilter(key, val) {
    setPage(1);
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <section className="admin-inline-overview-panel" aria-label="Projects overview section">
      <div className="admin-inline-overview-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="admin-stat-icon" style={{ width: "32px", height: "32px", borderRadius: "8px" }}>
            <BriefcaseBusiness size={18} />
          </span>
          <div>
            <h2>Projects Overview</h2>
            <small style={{ color: "rgb(17 24 39 / 60%)" }}>
              {total} {total === 1 ? "project recorded" : "projects recorded"}
            </small>
          </div>
        </div>
        <button
          type="button"
          className="admin-inline-close-btn"
          onClick={onCollapse}
          aria-label="Collapse projects overview"
        >
          <ChevronUp size={16} aria-hidden="true" />
          <span>Collapse</span>
        </button>
      </div>

      <div className="admin-inline-overview-body">
        {/* Preserved Filters & Search */}
        <div className="project-filter-grid">
          <label className="project-search">
            <span>Search projects</span>
            <span className="project-search-input">
              <Search size={17} aria-hidden="true" />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => updateFilter("q", e.target.value)}
                placeholder="Project name or description"
              />
            </span>
          </label>
          <label>
            <span>Department / company unit</span>
            <select
              value={filters.department}
              onChange={(e) => updateFilter("department", e.target.value)}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(e) => updateFilter("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {projectStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>From date</span>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => updateFilter("date_from", e.target.value)}
            />
          </label>
          <label>
            <span>To date</span>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => updateFilter("date_to", e.target.value)}
            />
          </label>
        </div>

        {loading && <p className="table-message" role="status">Loading projects…</p>}
        {!loading && error && (
          <div className="table-message modal-error" role="alert">
            <p>{error}</p>
            <button
              className="taskflow-secondary-button"
              type="button"
              onClick={() => setRetry((v) => v + 1)}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && projects.length === 0 && (
          <div className="table-message project-empty">
            <BriefcaseBusiness size={24} aria-hidden="true" />
            <strong>No projects found</strong>
            <span>
              {total === 0
                ? "No project records exist in this workspace."
                : "Try adjusting your search terms or filters."}
            </span>
          </div>
        )}

        {/* Responsive Table: Project Name | Start Date | End Date | Duration | Department | Staff | Completion | Ingage */}
        {!loading && !error && projects.length > 0 && (
          <>
            <div className="responsive-table-wrap">
              <table className="drilldown-table">
                <thead>
                  <tr>
                    <th scope="col">Project Name</th>
                    <th scope="col">Start Date</th>
                    <th scope="col">End Date</th>
                    <th scope="col">Duration</th>
                    <th scope="col">Department</th>
                    <th scope="col">Staff</th>
                    <th scope="col">Completion</th>
                    <th scope="col">Ingage</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const isSelected = activeProjectId === project.id;
                    return (
                      <tr
                        key={project.id}
                        className={isSelected ? "drilldown-row-selected" : ""}
                      >
                        <td>
                          <button
                            className={`table-project-link ${isSelected ? "table-project-link-active" : ""}`}
                            type="button"
                            onClick={() => onToggleProject(project.id)}
                            title={
                              isSelected
                                ? "Click to close Project Details"
                                : "Click to view Project Details"
                            }
                          >
                            <span>{project.name}</span>
                            {isSelected && (
                              <span className="active-pill-indicator">Active</span>
                            )}
                          </button>
                        </td>
                        <td>{formatDate(project.start_date)}</td>
                        <td>{formatDate(project.end_date)}</td>
                        <td>
                          <span className="project-duration-badge">
                            {project.duration_days ? `${project.duration_days} days` : "—"}
                          </span>
                        </td>
                        <td>{project.department || "Not assigned"}</td>
                        <td>
                          {project.members && project.members.length > 0 ? (
                            <div
                              className="member-names-summary"
                              title={project.members
                                .map(
                                  (m) =>
                                    `${m.full_name || m.email} (${m.staff_category || m.role})`
                                )
                                .join(", ")}
                            >
                              <span>
                                {project.members
                                  .slice(0, 2)
                                  .map((m) => m.full_name || m.email)
                                  .join(", ")}
                                {project.members.length > 2 &&
                                  ` +${project.members.length - 2} more`}
                              </span>
                            </div>
                          ) : (
                            <span className="profile-muted">Not assigned</span>
                          )}
                        </td>
                        <td>
                          <div className="project-completion-cell">
                            <div
                              className="project-completion-bar"
                              style={{
                                background: "rgb(17 24 39 / 10%)",
                                height: "6px",
                                borderRadius: "99px",
                                overflow: "hidden",
                                width: "70px",
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(100, project.completion_percent || 0)}%`,
                                  height: "100%",
                                  background:
                                    (project.completion_percent || 0) >= 100
                                      ? "#16a34a"
                                      : "#65a30d",
                                }}
                              />
                            </div>
                            <small>{project.completion_percent}%</small>
                          </div>
                        </td>
                        <td>
                          {project.member_categories &&
                          project.member_categories.length > 0 ? (
                            <span className="category-chips">
                              {project.member_categories.map((c) => (
                                <span key={c}>{c}</span>
                              ))}
                            </span>
                          ) : (
                            <span className="profile-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <nav className="table-pagination" aria-label="Project pagination">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div>
                <button
                  type="button"
                  className="taskflow-secondary-button"
                  disabled={page <= 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <button
                  type="button"
                  className="taskflow-secondary-button"
                  disabled={page * pageSize >= total}
                  onClick={() => setPage((v) => v + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </section>
  );
}

// =========================================================================
// 2. Staff Directory Section (Inline directly underneath the three cards)
// =========================================================================
export function StaffDirectorySection({
  category, // "Employee" or "Intern"
  totalCount,
  activeCount,
  activeUserId,
  onToggleUser,
  onCollapse,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [staff, setStaff] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadStaff() {
      setLoading(true);
      setError("");
      const params = { page, page_size: pageSize };
      if (category) params.category = category;
      if (search.trim()) params.q = search.trim();
      if (statusFilter) params.status = statusFilter;

      try {
        const response = await api.get("/api/users", { params });
        if (!cancelled) {
          setStaff(response.data.items || []);
          setTotal(response.data.total || 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Unable to load staff records right now."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStaff();
    return () => {
      cancelled = true;
    };
  }, [category, search, statusFilter, page, retry]);

  const title = category === "Intern" ? "Interns Overview" : "Employees Overview";

  return (
    <section className="admin-inline-overview-panel" aria-label={`${title} section`}>
      <div className="admin-inline-overview-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span className="admin-stat-icon" style={{ width: "32px", height: "32px", borderRadius: "8px" }}>
            <Users size={18} />
          </span>
          <div>
            <h2>{title}</h2>
            <div style={{ display: "flex", gap: "12px", fontSize: "0.76rem", color: "rgb(17 24 39 / 65%)" }}>
              <span>
                Total: <strong>{totalCount}</strong>
              </span>
              <span>
                Active: <strong style={{ color: "#65a30d" }}>{activeCount}</strong>
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="admin-inline-close-btn"
          onClick={onCollapse}
          aria-label={`Collapse ${title}`}
        >
          <ChevronUp size={16} aria-hidden="true" />
          <span>Collapse</span>
        </button>
      </div>

      <div className="admin-inline-overview-body">
        <div className="staff-toolbar">
          <label className="staff-search" style={{ flex: 1, minWidth: "220px" }}>
            <span>Search name or email</span>
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder={`Search ${category.toLowerCase()} records`}
            />
          </label>
          <label style={{ width: "200px" }}>
            <span>Account status</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
            >
              <option value="">All statuses</option>
              {accountStatuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading && <p className="table-message" role="status">Loading {category} records…</p>}
        {!loading && error && (
          <div className="table-message modal-error" role="alert">
            <p>{error}</p>
            <button
              className="taskflow-secondary-button"
              type="button"
              onClick={() => setRetry((v) => v + 1)}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && staff.length === 0 && (
          <div className="table-message project-empty">
            <Users size={24} aria-hidden="true" />
            <strong>No records found</strong>
            <span>No {category} records match the current filters.</span>
          </div>
        )}

        {!loading && !error && staff.length > 0 && (
          <>
            <div className="responsive-table-wrap">
              <table className="drilldown-table">
                <thead>
                  <tr>
                    <th scope="col">S.No</th>
                    <th scope="col">{category} Name</th>
                    <th scope="col">Email</th>
                    <th scope="col">Department</th>
                    {category === "Intern" && <th scope="col">Intern ID</th>}
                    {category === "Employee" && <th scope="col">Employee ID</th>}
                    <th scope="col">Account Status</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((person, index) => {
                    const isSelected = activeUserId === person.id;
                    return (
                      <tr
                        key={person.id}
                        className={isSelected ? "drilldown-row-selected" : ""}
                      >
                        <td>{(page - 1) * pageSize + index + 1}</td>
                        <td>
                          <button
                            className={`table-project-link ${isSelected ? "table-project-link-active" : ""}`}
                            type="button"
                            onClick={() => onToggleUser(person.id)}
                            style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
                            title={
                              isSelected
                                ? `Click to close ${category} Details`
                                : `Click to view ${category} Details`
                            }
                          >
                            <span
                              className="member-avatar"
                              style={{ width: "26px", height: "26px", fontSize: "0.68rem" }}
                            >
                              {person.full_name?.trim().charAt(0).toUpperCase() || "?"}
                            </span>
                            <span>{person.full_name || "Name not provided"}</span>
                            {isSelected && (
                              <span className="active-pill-indicator">Active</span>
                            )}
                          </button>
                        </td>
                        <td>{person.email}</td>
                        <td>{person.department || "General"}</td>
                        {category === "Intern" && <td>{person.intern_id || "—"}</td>}
                        {category === "Employee" && <td>{person.employee_id || "—"}</td>}
                        <td>
                          <span className={`profile-status status-${person.status}`}>
                            {person.status === "invitation_pending"
                              ? "Pending activation"
                              : person.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <nav className="table-pagination" aria-label="Staff pagination">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div>
                <button
                  type="button"
                  className="taskflow-secondary-button"
                  disabled={page <= 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
                </span>
                <button
                  type="button"
                  className="taskflow-secondary-button"
                  disabled={page * pageSize >= total}
                  onClick={() => setPage((v) => v + 1)}
                >
                  Next
                </button>
              </div>
            </nav>
          </>
        )}
      </div>
    </section>
  );
}

// =========================================================================
// 3. Project Details Modal Content
// =========================================================================
function ProjectDetailsModalContent({ projectId, onSelectUser, onTitleReady }) {
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [projRes, tasksRes] = await Promise.all([
          api.get(`/api/projects/${projectId}`),
          api.get("/api/tasks", { params: { project_id: projectId, page_size: 100 } }),
        ]);
        if (!cancelled) {
          setProject(projRes.data);
          setTasks(tasksRes.data.items || []);
          if (onTitleReady && projRes.data.name) {
            onTitleReady(projRes.data.name);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Unable to load project details and tasks."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [projectId, retry]);

  if (loading) {
    return <p className="modal-message" role="status">Loading project details and tasks…</p>;
  }

  if (error) {
    return (
      <div className="modal-message modal-error" role="alert">
        <p>{error}</p>
        <button
          className="taskflow-secondary-button"
          type="button"
          onClick={() => setRetry((v) => v + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!project) return null;

  const uniqueMembers = [];
  const seenMemberIds = new Set();
  if (Array.isArray(project.members)) {
    for (const m of project.members) {
      if (m && m.id && !seenMemberIds.has(m.id)) {
        seenMemberIds.add(m.id);
        uniqueMembers.push(m);
      }
    }
  }

  return (
    <div className="project-detail-content">
      {project.description && (
        <p className="project-description">{project.description}</p>
      )}

      <dl className="project-facts">
        <div>
          <dt>Department / company unit</dt>
          <dd>{project.department}</dd>
        </div>
        <div>
          <dt>Start date</dt>
          <dd>{formatDate(project.start_date)}</dd>
        </div>
        <div>
          <dt>End date</dt>
          <dd>{formatDate(project.end_date)}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{project.duration_days} calendar days (inclusive)</dd>
        </div>
        <div>
          <dt>Project manager</dt>
          <dd>{project.manager?.full_name || "Not provided"}</dd>
        </div>
        <div>
          <dt>Project status</dt>
          <dd>
            <span className="project-status">{project.status}</span>
          </dd>
        </div>
      </dl>

      {/* Project Team */}
      <section className="project-members-section" style={{ marginTop: "24px" }}>
        <h3>
          Project Team <span>{uniqueMembers.length}</span>
        </h3>
        {uniqueMembers.length > 0 ? (
          <ul
            className="member-chips-list"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
            }}
          >
            {uniqueMembers.map((member) => {
              const initials = member.full_name
                ? member.full_name
                    .trim()
                    .split(/\s+/)
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()
                : "?";
              const deptOrUnit = member.company_unit || member.department;
              return (
                <li
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 12px",
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                >
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.full_name || "Member"}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span
                      className="member-avatar"
                      style={{
                        width: "28px",
                        height: "28px",
                        fontSize: "0.72rem",
                      }}
                    >
                      {initials}
                    </span>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <strong style={{ fontSize: "0.85rem", color: "var(--tf-slate, #1e293b)" }}>
                      {member.full_name || "Team Member"}
                    </strong>
                    <small style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      {member.staff_category || (member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : "Member")}
                      {deptOrUnit ? ` • ${deptOrUnit}` : ""}
                    </small>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="profile-muted">No employee or intern assigned to this project's tasks yet.</p>
        )}
      </section>

      {/* Tasks Table: S.No | Task Name | Person Name | Department | Status | Ingage */}
      <section className="project-members-section" style={{ marginTop: "28px" }}>
        <h3>
          Project tasks <span>{tasks.length}</span>
        </h3>
        {tasks.length > 0 ? (
          <div className="responsive-table-wrap">
            <table className="drilldown-table">
              <thead>
                <tr>
                  <th scope="col">S.No</th>
                  <th scope="col">Task Name</th>
                  <th scope="col">Person Name</th>
                  <th scope="col">Department</th>
                  <th scope="col">Status</th>
                  <th scope="col">Staff</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, index) => {
                  const uniqueAssignees = [];
                  const seenAssigneeIds = new Set();
                  for (const a of task.assignees || []) {
                    if (a && a.id != null && !seenAssigneeIds.has(a.id)) {
                      seenAssigneeIds.add(a.id);
                      uniqueAssignees.push(a);
                    }
                  }

                  return (
                    <tr key={task.id}>
                      <td>{index + 1}</td>
                      <td>
                        <div style={{ display: "grid", gap: "2px" }}>
                          <strong style={{ fontSize: "0.82rem" }}>{task.title}</strong>
                          {task.priority && (
                            <small
                              style={{
                                color:
                                  task.priority === "Urgent"
                                    ? "#dc2626"
                                    : task.priority === "High"
                                    ? "#ea580c"
                                    : "#65a30d",
                                fontWeight: 650,
                              }}
                            >
                              Priority: {task.priority}
                            </small>
                          )}
                        </div>
                      </td>
                      <td>
                        {uniqueAssignees.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {uniqueAssignees.map((a) => {
                              const initials = a.full_name
                                ? a.full_name
                                    .trim()
                                    .split(/\s+/)
                                    .map((w) => w[0])
                                    .slice(0, 2)
                                    .join("")
                                    .toUpperCase()
                                : "?";
                              return (
                                <div
                                  key={a.id}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "2px 8px",
                                    background: "#f8fafc",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "6px",
                                    width: "fit-content",
                                    minHeight: "26px",
                                    boxSizing: "border-box",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: "18px",
                                      height: "18px",
                                      borderRadius: "50%",
                                      background: "#65a30d",
                                      color: "#ffffff",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      fontSize: "0.6rem",
                                      fontWeight: 700,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {initials}
                                  </span>
                                  <button
                                    type="button"
                                    className="table-person-button"
                                    onClick={() => onSelectUser(a.id)}
                                    title={`View ${a.full_name || a.email}`}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                      color: "#1e293b",
                                      fontWeight: 600,
                                      textAlign: "left",
                                      cursor: "pointer",
                                      textDecoration: "underline",
                                      textDecorationColor: "#65a30d",
                                      fontSize: "0.78rem",
                                    }}
                                  >
                                    {a.full_name || a.email}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="profile-muted">Unassigned</span>
                        )}
                      </td>
                      <td>
                        {uniqueAssignees.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {uniqueAssignees.map((a) => {
                              const dept = a.department || a.company_unit || project.department || "—";
                              return (
                                <div
                                  key={a.id}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "2px 8px",
                                    background: "#f1f5f9",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "6px",
                                    fontSize: "0.74rem",
                                    color: "#334155",
                                    fontWeight: 500,
                                    width: "fit-content",
                                    minHeight: "26px",
                                    boxSizing: "border-box",
                                  }}
                                >
                                  {dept}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="profile-muted">—</span>
                        )}
                      </td>
                      <td>
                        <span className="project-status status-badge-pill">
                          {task.status}
                        </span>
                      </td>
                      <td>
                        {uniqueAssignees.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {uniqueAssignees.map((a) => {
                              const roleStr =
                                a.staff_category ||
                                (a.role ? a.role.charAt(0).toUpperCase() + a.role.slice(1) : "Member");
                              const badgeStyle = getStaffBadgeStyle(roleStr);
                              return (
                                <div
                                  key={a.id}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "2px 8px",
                                    background: badgeStyle.background,
                                    border: badgeStyle.border,
                                    borderRadius: "6px",
                                    fontSize: "0.74rem",
                                    color: badgeStyle.color,
                                    fontWeight: 600,
                                    width: "fit-content",
                                    minHeight: "26px",
                                    boxSizing: "border-box",
                                  }}
                                >
                                  {roleStr}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="profile-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="profile-muted">No tasks created for this project yet.</p>
        )}
      </section>
    </div>
  );
}

// =========================================================================
// 4. Staff Profile Modal Content
// =========================================================================
function StaffProfileModalContent({ userId, onSelectProject, onTitleReady }) {
  const [profile, setProfile] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [profileRes, tasksRes] = await Promise.all([
          api.get(`/api/users/${userId}`),
          api.get("/api/tasks", { params: { user_id: userId, page_size: 100 } }),
        ]);
        if (!cancelled) {
          setProfile(profileRes.data);
          setTasks(tasksRes.data.items || []);
          if (onTitleReady && profileRes.data.full_name) {
            onTitleReady(profileRes.data.full_name);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Unable to load staff profile."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, retry]);

  if (loading) {
    return <p className="modal-message" role="status">Loading profile details and tasks…</p>;
  }

  if (error) {
    return (
      <div className="modal-message modal-error" role="alert">
        <p>{error}</p>
        <button
          className="taskflow-secondary-button"
          type="button"
          onClick={() => setRetry((v) => v + 1)}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="profile-content">
      {/* Profile Header with Avatar/Initials, Full Name, Category, and Account Status */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.full_name || "Profile"}
            className="member-avatar"
            style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            className="member-avatar"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "#65a30d",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "1.1rem",
              flexShrink: 0,
            }}
          >
            {getInitials(profile.full_name)}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <strong style={{ fontSize: "1.1rem", color: "var(--tf-slate, #0f172a)" }}>
            {profile.full_name || "Staff Member"}
          </strong>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span className="member-category" style={{ fontSize: "0.72rem" }}>
              {profile.staff_category || displayRole(profile)}
            </span>
            <span className={`profile-status status-${profile.status}`} style={{ fontSize: "0.72rem" }}>
              {profile.status === "invitation_pending" ? "Pending activation" : profile.status}
            </span>
          </div>
        </div>
      </div>

      <dl className="profile-details-grid">
        {profile.employee_id && (
          <div>
            <dt>Employee ID</dt>
            <dd>{profile.employee_id}</dd>
          </div>
        )}
        {profile.intern_id && (
          <div>
            <dt>Intern ID</dt>
            <dd>{profile.intern_id}</dd>
          </div>
        )}
        <div>
          <dt>Email</dt>
          <dd>{profile.email}</dd>
        </div>
        <div>
          <dt>Mobile</dt>
          <dd>{profile.mobile || "Not provided"}</dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{displayRole(profile)}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{profile.department || "Not provided"}</dd>
        </div>
        {Boolean(profile.joining_date) && (
          <div>
            <dt>Joining date</dt>
            <dd>{formatDate(profile.joining_date)}</dd>
          </div>
        )}
        <div>
          <dt>Reporting manager</dt>
          <dd>{profile.reporting_manager?.full_name || "Not provided"}</dd>
        </div>
        <div>
          <dt>Invitation status</dt>
          <dd>{profile.invitation_status || "Completed"}</dd>
        </div>
        <div>
          <dt>Registration completed</dt>
          <dd>{formatDateTime(profile.registration_completed_at)}</dd>
        </div>
      </dl>

      {profile.skills && profile.skills.length > 0 && (
        <section className="profile-section">
          <h3>Skills</h3>
          <p className="profile-skills">{profile.skills.join(", ")}</p>
        </section>
      )}

      {/* Assigned Projects: Only displayed if user has actual project-linked task assignments */}
      {Boolean(profile.assigned_projects && profile.assigned_projects.length > 0) && (
        <section className="profile-section">
          <h3>
            Assigned projects <span>{profile.assigned_projects.length}</span>
          </h3>
          <ul className="profile-project-list">
            {profile.assigned_projects.map((proj) => (
              <li key={proj.id}>
                <button
                  type="button"
                  className="table-project-link"
                  onClick={() => onSelectProject && onSelectProject(proj.id)}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <strong>{proj.name}</strong>
                  <ExternalLink size={13} aria-hidden="true" />
                </button>
                <span>
                  {proj.status} · {proj.department}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Relevant Tasks */}
      <section className="profile-section" style={{ marginTop: "24px" }}>
        <h3>
          Relevant assigned tasks <span>{tasks.length}</span>
        </h3>
        {tasks.length > 0 ? (
          <div className="responsive-table-wrap">
            <table className="drilldown-table">
              <thead>
                <tr>
                  <th scope="col">S.No</th>
                  <th scope="col">Task Name</th>
                  <th scope="col">Project</th>
                  <th scope="col">Status</th>
                  <th scope="col">Priority</th>
                  <th scope="col">Due Date</th>
                  <th scope="col">Progress</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, index) => (
                  <tr key={task.id}>
                    <td>{index + 1}</td>
                    <td>
                      <strong style={{ fontSize: "0.82rem" }}>{task.title}</strong>
                    </td>
                    <td>
                      {task.project ? (
                        <button
                          type="button"
                          className="table-project-link"
                          onClick={() => onSelectProject && onSelectProject(task.project.id)}
                        >
                          {task.project.name}
                        </button>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>Standalone Task</span>
                      )}
                    </td>
                    <td>
                      <span className="project-status status-badge-pill">
                        {task.status}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          color:
                            task.priority === "Urgent"
                              ? "#dc2626"
                              : task.priority === "High"
                              ? "#ea580c"
                              : "#65a30d",
                          fontWeight: 650,
                          fontSize: "0.76rem",
                        }}
                      >
                        {task.priority || "Medium"}
                      </span>
                    </td>
                    <td>{formatDate(task.due_date)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div
                          style={{
                            background: "rgb(17 24 39 / 10%)",
                            height: "6px",
                            borderRadius: "99px",
                            overflow: "hidden",
                            width: "50px",
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, task.progress || 0)}%`,
                              height: "100%",
                              background:
                                (task.progress || 0) >= 100 ? "#16a34a" : "#65a30d",
                            }}
                          />
                        </div>
                        <small>{task.progress || 0}%</small>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="profile-muted">No tasks currently assigned to this account.</p>
        )}
      </section>
    </div>
  );
}

// =========================================================================
// 5. Unified Detail Modal Controller (Project / Staff details popup)
// =========================================================================
export function AdminDetailModal({ modalStack, onClose, onBack, onPush }) {
  const [customTitle, setCustomTitle] = useState("");

  if (!modalStack || modalStack.length === 0) return null;

  const current = modalStack[modalStack.length - 1];
  const canGoBack = modalStack.length > 1;

  let fallbackTitle = current.type === "project" ? "Project Details" : "Staff Profile";
  let content = null;
  let modalClassName = "admin-dashboard-modal-wide";

  if (current.type === "project") {
    modalClassName = "project-details-modal admin-dashboard-modal-wide";
    content = (
      <ProjectDetailsModalContent
        projectId={current.id}
        onSelectUser={(userId) => onPush({ type: "user", id: userId })}
        onTitleReady={(name) => setCustomTitle(name)}
      />
    );
  } else if (current.type === "user") {
    modalClassName = "staff-profile-modal admin-dashboard-modal-wide";
    content = (
      <StaffProfileModalContent
        userId={current.id}
        onSelectProject={(projectId) => onPush({ type: "project", id: projectId })}
        onTitleReady={(name) => setCustomTitle(name)}
      />
    );
  }

  return (
    <AccessibleModal
      title={customTitle || fallbackTitle}
      onClose={onClose}
      onBack={canGoBack ? onBack : null}
      className={modalClassName}
    >
      {content}
    </AccessibleModal>
  );
}
