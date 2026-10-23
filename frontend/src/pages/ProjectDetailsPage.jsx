import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Building2,
  User,
  Users,
  FileText,
  ExternalLink,
  Edit,
  Download,
  Trash2,
  Plus,
  AlertCircle,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  FileArchive,
  FileCheck,
} from "lucide-react";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";
import { AdminDetailModal } from "../components/AdminDashboardModals.jsx";
import "./ProjectsManagement.css";

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return "Not specified";
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

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
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
      return <Clock size={14} aria-hidden="true" />;
    case "completed":
      return <CheckCircle2 size={14} aria-hidden="true" />;
    case "on hold":
      return <AlertCircle size={14} aria-hidden="true" />;
    case "cancelled":
      return <XCircle size={14} aria-hidden="true" />;
    default:
      return <Clock size={14} aria-hidden="true" />;
  }
}

function getFileIcon(filename) {
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheet size={20} className="doc-icon" />;
  }
  if (["zip", "tar", "gz"].includes(ext)) {
    return <FileArchive size={20} className="doc-icon" />;
  }
  return <FileText size={20} className="doc-icon" />;
}

export default function ProjectDetailsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const basePath = location.pathname.startsWith("/manager") ? "/manager" : "/admin";

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  // Document upload modal state
  const [showDocUploadModal, setShowDocUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Link modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [linkError, setLinkError] = useState("");

  // User details / project details popup modal stack
  const [modalStack, setModalStack] = useState([]);

  function handleSelectUser(userId) {
    if (userId) {
      setModalStack([{ type: "user", id: userId }]);
    }
  }

  function handleCloseModal() {
    setModalStack([]);
  }

  function handleBackModal() {
    setModalStack((prev) => prev.slice(0, prev.length - 1));
  }

  function handlePushModal(item) {
    setModalStack((prev) => [...prev, item]);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadProject() {
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
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            typeof err.response?.data?.detail === "string"
              ? err.response.data.detail
              : "Unable to load project details.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (projectId) {
      loadProject();
    }

    return () => {
      cancelled = true;
    };
  }, [projectId, retry]);

  // File Download handler
  async function handleDownloadDoc(doc) {
    try {
      const response = await api.get(
        `/api/projects/${projectId}/documents/${doc.id}/download`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", doc.file_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(
        "Failed to download document: " +
        (err.response?.data?.detail || err.message),
      );
    }
  }

  // Delete Document
  async function handleDeleteDoc(docId) {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await api.delete(`/api/projects/${projectId}/documents/${docId}`);
      setProject((prev) => ({
        ...prev,
        documents: prev.documents.filter((d) => d.id !== docId),
      }));
    } catch (err) {
      alert("Failed to delete document: " + (err.response?.data?.detail || err.message));
    }
  }

  // Upload Document Submit
  async function handleUploadDocSubmit(e) {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Please select a file to upload.");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError("Document title is required.");
      return;
    }

    setIsUploading(true);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("title", uploadTitle.trim());
    if (uploadDesc.trim()) {
      formData.append("description", uploadDesc.trim());
    }

    try {
      const res = await api.post(`/api/projects/${projectId}/documents`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProject((prev) => ({
        ...prev,
        documents: [res.data, ...(prev.documents || [])],
      }));
      setShowDocUploadModal(false);
      setUploadFile(null);
      setUploadTitle("");
      setUploadDesc("");
    } catch (err) {
      setUploadError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  // Delete Link
  async function handleDeleteLink(linkId) {
    if (!window.confirm("Are you sure you want to remove this link?")) return;
    try {
      await api.delete(`/api/projects/${projectId}/links/${linkId}`);
      setProject((prev) => ({
        ...prev,
        links: prev.links.filter((l) => l.id !== linkId),
      }));
    } catch (err) {
      alert("Failed to delete link: " + (err.response?.data?.detail || err.message));
    }
  }

  // Add Link Submit
  async function handleAddLinkSubmit(e) {
    e.preventDefault();
    if (!linkTitle.trim()) {
      setLinkError("Link title is required.");
      return;
    }
    if (!linkUrl.trim()) {
      setLinkError("URL is required.");
      return;
    }

    setIsAddingLink(true);
    setLinkError("");

    try {
      const res = await api.post(`/api/projects/${projectId}/links`, {
        title: linkTitle.trim(),
        url: linkUrl.trim(),
        description: linkDesc.trim() || null,
      });
      setProject((prev) => ({
        ...prev,
        links: [...(prev.links || []), res.data],
      }));
      setShowLinkModal(false);
      setLinkTitle("");
      setLinkUrl("");
      setLinkDesc("");
    } catch (err) {
      setLinkError(err.response?.data?.detail || "Failed to add link.");
    } finally {
      setIsAddingLink(false);
    }
  }

  const canEdit = user?.role === "admin" || user?.role === "manager";

  if (loading) {
    return (
      <div className="project-details-page">
        <Link to={`${basePath}/projects`} className="back-nav-link">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to Projects</span>
        </Link>
        <div className="projects-loading-state" role="status">
          <Clock size={28} className="animate-spin text-lime-600" />
          <p>Loading project details...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="project-details-page">
        <Link to={`${basePath}/projects`} className="back-nav-link">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to Projects</span>
        </Link>
        <div className="projects-error-state" role="alert">
          <AlertCircle size={32} color="#dc2626" aria-hidden="true" />
          <h3>Project Not Found</h3>
          <p>{error || "The requested project could not be found."}</p>
          <button
            type="button"
            className="projects-primary-btn"
            onClick={() => setRetry((r) => r + 1)}
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

  // Deduplicate project team members by id
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
    <div className="project-details-page">
      {/* Back Navigation */}
      <Link to={`${basePath}/projects`} className="back-nav-link" id="back-to-projects-btn">
        <ArrowLeft size={16} aria-hidden="true" />
        <span>Back to Projects</span>
      </Link>

      {/* Main Hero Card */}
      <section className="details-hero-card" aria-label="Project Overview">
        <div className="details-hero-top">
          <div className="details-hero-title-group">
            <div className="details-badges-row">
              <span className="project-dept-tag">{project.department}</span>
              <span className={`project-status-badge ${getStatusBadgeClass(project.status)}`}>
                {getStatusIcon(project.status)}
                <span>{project.status}</span>
              </span>
            </div>
            <h1>{project.name}</h1>
            {project.client_name && (
              <div className="project-client-name" style={{ fontSize: "0.95rem" }}>
                <Building2 size={16} aria-hidden="true" />
                <span>Client: <strong>{project.client_name}</strong></span>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="details-hero-actions">
              <Link
                to={`${basePath}/projects/${project.id}/edit`}
                className="projects-primary-btn"
                id="edit-project-btn"
              >
                <Edit size={16} aria-hidden="true" />
                <span>Edit Project</span>
              </Link>
            </div>
          )}
        </div>

        {/* Fact Grid */}
        <dl className="details-grid">
          <div className="details-fact-item">
            <dt>Department</dt>
            <dd>{project.department}</dd>
          </div>
          <div className="details-fact-item">
            <dt>Project Manager</dt>
            <dd>{project.manager?.full_name || "Unassigned"}</dd>
          </div>
          <div className="details-fact-item">
            <dt>Start Date</dt>
            <dd>{formatDate(project.start_date)}</dd>
          </div>
          <div className="details-fact-item">
            <dt>End Date</dt>
            <dd>{formatDate(project.end_date)}</dd>
          </div>
          <div className="details-fact-item">
            <dt>Duration</dt>
            <dd>{project.duration_days > 0 ? `${project.duration_days} days` : "—"}</dd>
          </div>
        </dl>

        {/* Project Description */}
        {project.description && (
          <div className="details-description-box">
            <h3>Description</h3>
            <p>{project.description}</p>
          </div>
        )}
      </section>

      {/* Project Team Section */}
      <section className="details-panel" aria-label="Project Team" style={{ marginBottom: "24px" }}>
        <div className="details-panel-header">
          <h2>
            <Users size={20} color="#65a30d" aria-hidden="true" />
            <span>Project Team</span>
            <span className="details-badge-count">{uniqueMembers.length}</span>
          </h2>
        </div>

        {uniqueMembers.length > 0 ? (
          <div className="members-list">
            {uniqueMembers.map((member) => {
              const initials = getInitials(member.full_name);
              const deptOrUnit = member.company_unit || member.department;
              return (
                <div key={member.id} className="member-item-card">
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt={member.full_name || "Member"}
                      className="member-avatar"
                      style={{ objectFit: "cover", cursor: "pointer" }}
                      onClick={() => handleSelectUser(member.id)}
                      title={`View ${member.full_name || "Member"}'s details`}
                    />
                  ) : (
                    <div
                      className="member-avatar"
                      aria-hidden="true"
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSelectUser(member.id)}
                      title={`View ${member.full_name || "Member"}'s details`}
                    >
                      {initials}
                    </div>
                  )}
                  <div className="member-info">
                    <button
                      type="button"
                      onClick={() => handleSelectUser(member.id)}
                      className="member-name"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        fontWeight: 650,
                        textDecoration: "underline",
                        color: "inherit",
                        fontSize: "inherit",
                      }}
                      title={`View ${member.full_name || "Member"}'s details`}
                    >
                      {member.full_name || "Team Member"}
                    </button>
                    <span className="member-role">
                      {member.staff_category || (member.role ? member.role.charAt(0).toUpperCase() + member.role.slice(1) : "Member")}
                      {deptOrUnit ? ` • ${deptOrUnit}` : ""}
                    </span>
                    {member.email && (
                      <span style={{ fontSize: "0.74rem", color: "#64748b", marginTop: "1px" }}>
                        {member.email}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-sm py-3" style={{ margin: 0, color: "var(--tf-slate-muted)" }}>
            No employee or intern assigned to this project's tasks yet.
          </p>
        )}
      </section>

      {/* Project Tasks Section */}
      <section className="details-panel" aria-label="Project Tasks" style={{ marginBottom: "24px" }}>
        <div className="details-panel-header">
          <h2>
            <FileCheck size={20} color="#65a30d" aria-hidden="true" />
            <span>Project Tasks</span>
            <span className="details-badge-count">{tasks.length}</span>
          </h2>
        </div>

        {tasks.length > 0 ? (
          <div className="responsive-table-wrap" style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
            <table className="drilldown-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th scope="col" style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>S.No</th>
                  <th scope="col" style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>Task Name</th>
                  <th scope="col" style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>Person Name</th>
                  <th scope="col" style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>Department</th>
                  <th scope="col" style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>Status</th>
                  <th scope="col" style={{ padding: "10px 14px", textAlign: "left", fontSize: "0.72rem", color: "#64748b", fontWeight: 700 }}>Staff</th>
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
                    <tr key={task.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>{index + 1}</td>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        <div style={{ display: "grid", gap: "2px" }}>
                          <strong style={{ fontSize: "0.85rem", color: "#0f172a" }}>{task.title}</strong>
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
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        {uniqueAssignees.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {uniqueAssignees.map((a) => {
                              const initials = getInitials(a.full_name);
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
                                    onClick={() => handleSelectUser(a.id)}
                                    title={`View ${a.full_name || a.email}'s details`}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      padding: 0,
                                      fontSize: "0.78rem",
                                      fontWeight: 650,
                                      color: "#1e293b",
                                      cursor: "pointer",
                                      textDecoration: "underline",
                                      textAlign: "left",
                                    }}
                                  >
                                    {a.full_name || a.email}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
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
                          <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                        <span className={`project-status-badge ${getStatusBadgeClass(task.status)}`} style={{ padding: "2px 8px", fontSize: "0.72rem" }}>
                          {task.status}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", verticalAlign: "middle" }}>
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
                          <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm py-3" style={{ margin: 0, color: "var(--tf-slate-muted)" }}>
            No tasks created for this project yet.
          </p>
        )}
      </section>

      {/* Details Sections Grid (Documents & External Links) */}
      <div className="details-sections-grid">
        {/* Documents Panel */}
        <section className="details-panel" aria-label="Project Documents">
          <div className="details-panel-header">
            <h2>
              <FileText size={20} color="#65a30d" aria-hidden="true" />
              <span>Documents</span>
            </h2>
          </div>

          {project.documents && project.documents.length > 0 ? (
            <div className="documents-list">
              {project.documents.map((doc) => (
                <div key={doc.id} className="document-item-row">
                  <div className="doc-left">
                    {getFileIcon(doc.file_name)}
                    <div className="doc-details">
                      <span className="doc-title">{doc.title}</span>
                      <div className="doc-meta">
                        <span>{doc.file_name}</span>
                        <span>•</span>
                        <span>{formatBytes(doc.file_size)}</span>
                        <span>•</span>
                        <span>{formatDate(doc.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="doc-actions">
                    <button
                      type="button"
                      className="icon-action-btn"
                      title="Download / View document"
                      onClick={() => handleDownloadDoc(doc)}
                    >
                      <Download size={16} aria-hidden="true" />
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        className="icon-action-btn delete"
                        title="Delete document"
                        onClick={() => handleDeleteDoc(doc.id)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-3">No documents attached.</p>
          )}
        </section>

        {/* External Links Panel */}
        <section className="details-panel" aria-label="External Project Links">
          <div className="details-panel-header">
            <h2>
              <ExternalLink size={20} color="#65a30d" aria-hidden="true" />
              <span>External Links</span>
            </h2>
          </div>

          {project.links && project.links.length > 0 ? (
            <div className="links-list">
              {project.links.map((link) => (
                <div key={link.id} className="link-item-row">
                  <div className="link-left">
                    <span className="link-title">
                      {link.title}
                    </span>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-url"
                      title={link.url}
                    >
                      {link.url}
                    </a>
                    {link.description && (
                      <span className="link-desc">{link.description}</span>
                    )}
                  </div>
                  {canEdit && (
                    <div className="doc-actions">
                      <button
                        type="button"
                        className="icon-action-btn delete"
                        title="Remove link"
                        onClick={() => handleDeleteLink(link.id)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm py-3">No external links added.</p>
          )}
        </section>
      </div>

      {/* Upload Document Modal */}
      {showDocUploadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <h3 className="text-lg font-bold text-gray-900">Upload Project Document</h3>
            {uploadError && <div className="alert-banner error">{uploadError}</div>}
            <form onSubmit={handleUploadDocSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label>Document Title <span className="required-asterisk">*</span></label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Project Scope Document"
                />
              </div>
              <div className="form-group">
                <label>Description (Optional)</label>
                <textarea
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  placeholder="Short note about the document contents"
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label>File (PDF, DOCX, XLSX, PPTX, etc., max 25MB) <span className="required-asterisk">*</span></label>
                <input
                  type="file"
                  required
                  onChange={(e) => {
                    const f = e.target.files[0];
                    setUploadFile(f || null);
                    if (f && !uploadTitle) {
                      setUploadTitle(f.name.replace(/\.[^/.]+$/, ""));
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="projects-secondary-btn"
                  onClick={() => setShowDocUploadModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="projects-primary-btn"
                >
                  {isUploading ? "Uploading..." : "Upload Document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
            <h3 className="text-lg font-bold text-gray-900">Add External Project Link</h3>
            {linkError && <div className="alert-banner error">{linkError}</div>}
            <form onSubmit={handleAddLinkSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label>Link Title <span className="required-asterisk">*</span></label>
                <input
                  type="text"
                  required
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="e.g. Jira Board, Figma Design"
                />
              </div>
              <div className="form-group">
                <label>URL (must start with http:// or https://) <span className="required-asterisk">*</span></label>
                <input
                  type="url"
                  required
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="form-group">
                <label>Description (Optional)</label>
                <textarea
                  value={linkDesc}
                  onChange={(e) => setLinkDesc(e.target.value)}
                  placeholder="Optional brief description"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="projects-secondary-btn"
                  onClick={() => setShowLinkModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingLink}
                  className="projects-primary-btn"
                >
                  {isAddingLink ? "Adding..." : "Add Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Details & Project Details Popup Modal */}
      <AdminDetailModal
        modalStack={modalStack}
        onClose={handleCloseModal}
        onBack={handleBackModal}
        onPush={handlePushModal}
      />
    </div>
  );
}
