import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Plus,
  Search,
  Building2,
  Calendar,
  User,
  Users,
  ArrowRight,
  Briefcase,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
} from "lucide-react";
import api from "../api.js";
import "./ProjectsManagement.css";

const departments = ["All Departments", "Ingage", "Rezov", "Edutech"];
const statuses = ["All Statuses", "Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${dateStr}T12:00:00Z`));
  } catch {
    return dateStr;
  }
}

function getStatusBadgeClass(status) {
  switch (status?.toLowerCase()) {
    case "in progress":
      return "status-in-progress";
    case "completed":
      return "status-completed";
    case "on hold":
      return "status-on-hold";
    case "cancelled":
      return "status-cancelled";
    default:
      return "status-not-started";
  }
}

function getStatusIcon(status) {
  switch (status?.toLowerCase()) {
    case "in progress":
      return <Clock size={13} aria-hidden="true" />;
    case "completed":
      return <CheckCircle2 size={13} aria-hidden="true" />;
    case "on hold":
      return <AlertCircle size={13} aria-hidden="true" />;
    case "cancelled":
      return <XCircle size={13} aria-hidden="true" />;
    default:
      return <Clock size={13} aria-hidden="true" />;
  }
}

export default function AdminProjects() {
  const location = useLocation();
  const basePath = location.pathname.startsWith("/manager") ? "/manager" : "/admin";

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("All Departments");
  const [selectedStatus, setSelectedStatus] = useState("All Statuses");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchProjects() {
      setLoading(true);
      setError("");

      const params = { page: 1, page_size: 100 };
      if (searchQuery.trim()) {
        params.q = searchQuery.trim();
      }
      if (selectedDept !== "All Departments") {
        params.department = selectedDept;
      }
      if (selectedStatus !== "All Statuses") {
        params.status = selectedStatus;
      }

      try {
        const response = await api.get("/api/projects", { params });
        if (!cancelled) {
          setProjects(response.data.items || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Unable to load projects from database.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProjects();

    return () => {
      cancelled = true;
    };
  }, [searchQuery, selectedDept, selectedStatus, retryCount]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedDept !== "All Departments" ||
    selectedStatus !== "All Statuses";

  function handleResetFilters() {
    setSearchQuery("");
    setSelectedDept("All Departments");
    setSelectedStatus("All Statuses");
  }

  return (
    <div className="projects-page">
      {/* Page Header */}
      <header className="projects-header">
        <div className="projects-header-info">
          <h1>Projects</h1>
          <p>Create, view and manage all projects.</p>
        </div>
        <Link to={`${basePath}/projects/new`} className="projects-primary-btn" id="add-project-btn">
          <Plus size={18} aria-hidden="true" />
          <span>Add New Project</span>
        </Link>
      </header>

      {/* Controls Bar */}
      <section className="projects-controls-bar" aria-label="Project search and filters">
        <div className="projects-search-box">
          <Search size={17} color="#6b7280" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects by name, description or client..."
            aria-label="Search projects"
          />
        </div>

        <div className="projects-filter-group">
          <label htmlFor="dept-filter" className="sr-only">Filter by Department</label>
          <select
            id="dept-filter"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <label htmlFor="status-filter" className="sr-only">Filter by Status</label>
          <select
            id="status-filter"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            {statuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              className="projects-secondary-btn"
              onClick={handleResetFilters}
              title="Reset all filters"
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </section>

      {/* Loading State */}
      {loading && (
        <div className="projects-loading-state" role="status">
          <div className="projects-empty-icon">
            <Clock size={24} className="animate-spin" />
          </div>
          <p>Loading projects from database...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="projects-error-state" role="alert">
          <AlertCircle size={32} color="#dc2626" aria-hidden="true" />
          <p>{error}</p>
          <button
            type="button"
            className="projects-primary-btn"
            onClick={() => setRetryCount((prev) => prev + 1)}
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>Retry Loading</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && projects.length === 0 && (
        <div className="projects-empty-state">
          <div className="projects-empty-icon" aria-hidden="true">
            <Briefcase size={28} />
          </div>
          <h3>No projects found</h3>
          <p>
            {hasActiveFilters
              ? "No projects match your search criteria. Try resetting your search or filters."
              : "Get started by creating your first project for your organization."}
          </p>
          {hasActiveFilters ? (
            <button type="button" className="projects-secondary-btn" onClick={handleResetFilters}>
              Clear Filters
            </button>
          ) : (
            <Link to={`${basePath}/projects/new`} className="projects-primary-btn">
              <Plus size={18} aria-hidden="true" />
              <span>Add New Project</span>
            </Link>
          )}
        </div>
      )}

      {/* Responsive Project Cards Grid */}
      {!loading && !error && projects.length > 0 && (
        <div className="projects-grid" role="region" aria-label="Projects list">
          {projects.map((proj) => {
            const hasDates = proj.start_date || proj.end_date;

            return (
              <article key={proj.id} className="project-card" id={`project-card-${proj.id}`}>
                <div className="project-card-top">
                  <span className="project-dept-tag">{proj.department}</span>
                  <span className={`project-status-badge ${getStatusBadgeClass(proj.status)}`}>
                    {getStatusIcon(proj.status)}
                    <span>{proj.status}</span>
                  </span>
                </div>

                <h2 className="project-card-title">{proj.name}</h2>

                {proj.client_name && (
                  <div className="project-client-name">
                    <Building2 size={14} aria-hidden="true" />
                    <span>{proj.client_name}</span>
                  </div>
                )}

                {proj.description && (
                  <p className="project-card-desc" title={proj.description}>
                    {proj.description}
                  </p>
                )}

                {/* Meta details */}
                <div className="project-card-meta">
                  <div className="meta-row">
                    <Users size={14} aria-hidden="true" />
                    <span>
                      Team: {proj.members ? new Set(proj.members.map((m) => m.id)).size : 0} members
                    </span>
                  </div>
                  {hasDates && (
                    <div className="meta-row">
                      <Calendar size={14} aria-hidden="true" />
                      <span>
                        {formatDate(proj.start_date)} – {formatDate(proj.end_date)}
                        {proj.duration_days > 0 ? ` (${proj.duration_days} days)` : ""}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Action */}
                <div className="project-card-actions">
                  <Link
                    to={`${basePath}/projects/${proj.id}`}
                    className="view-project-link"
                    id={`view-project-${proj.id}`}
                  >
                    <span>View Project</span>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
