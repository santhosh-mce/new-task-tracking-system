import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  FileText,
  ExternalLink,
  Check,
  AlertCircle,
  Clock,
  RotateCcw,
  Search,
  X,
  Download,
  RefreshCw,
} from "lucide-react";
import api from "../api.js";
import "./ProjectsManagement.css";

const departments = ["Ingage", "Rezov", "Edutech"];
const statuses = ["Not Started", "In Progress", "On Hold", "Completed", "Cancelled"];

export default function ProjectFormPage({ isEdit = false }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith("/manager") ? "/manager" : "/admin";

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [department, setDepartment] = useState("Ingage");
  const [status, setStatus] = useState("Not Started");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [managerId, setManagerId] = useState("");

  // Team members
  const [availableUsers, setAvailableUsers] = useState([]);
  const [existingMembers, setExistingMembers] = useState([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");

  // External Links
  const [links, setLinks] = useState([]);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkDesc, setNewLinkDesc] = useState("");

  // Documents
  const [existingDocs, setExistingDocs] = useState([]);
  const [pendingUploads, setPendingUploads] = useState([]); // array of { file, title, description }

  // Metadata edit modal in edit mode
  const [editingDoc, setEditingDoc] = useState(null);
  const [editDocTitle, setEditDocTitle] = useState("");
  const [editDocDesc, setEditDocDesc] = useState("");

  // UI state
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState("");

  // Fetch available users
  useEffect(() => {
    let cancelled = false;
    async function fetchUsers() {
      try {
        const res = await api.get("/api/users", { params: { page_size: 100 } });
        if (!cancelled) {
          const activeUsers = (res.data.items || []).filter(
            (u) => u.status === "active",
          );
          setAvailableUsers(activeUsers);
        }
      } catch (err) {
        console.error("Failed to load users for project assignment:", err);
      }
    }
    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  // In edit mode: load existing project data
  useEffect(() => {
    if (!isEdit || !projectId) return;

    let cancelled = false;
    async function loadProjectData() {
      setLoading(true);
      setPageError("");
      try {
        const res = await api.get(`/api/projects/${projectId}`);
        if (cancelled) return;
        const p = res.data;
        setName(p.name || "");
        setDescription(p.description || "");
        setClientName(p.client_name || "");
        setDepartment(p.department || "Ingage");
        setStatus(p.status || "Not Started");
        setStartDate(p.start_date || "");
        setEndDate(p.end_date || "");
        setManagerId(p.manager?.id ? String(p.manager.id) : "");
        setExistingMembers(p.members || []);
        setSelectedMemberIds(p.members?.map((m) => m.id) || []);
        setExistingDocs(p.documents || []);
        setLinks(
          p.links?.map((l) => ({
            id: l.id,
            title: l.title,
            url: l.url,
            description: l.description || "",
          })) || [],
        );
      } catch (err) {
        if (!cancelled) {
          setPageError(
            err.response?.data?.detail || "Failed to load project for editing.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProjectData();
    return () => {
      cancelled = true;
    };
  }, [isEdit, projectId]);

  // Validation
  function validate() {
    const errors = {};
    if (!name.trim()) errors.name = "Project name is required.";
    if (!description.trim()) errors.description = "Project description is required.";
    if (!startDate) errors.startDate = "Start date is required.";
    if (!endDate) errors.endDate = "End date is required.";
    if (startDate && endDate && startDate > endDate) {
      errors.endDate = "End date must be on or after start date.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Handle member checkbox toggle
  function toggleMember(userId) {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  // Handle adding an external link to local state
  function handleAddLink() {
    if (!newLinkTitle.trim()) {
      alert("Please enter a link title.");
      return;
    }
    const trimmedUrl = newLinkUrl.trim();
    if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
      alert("URL must start with http:// or https://");
      return;
    }

    setLinks((prev) => [
      ...prev,
      {
        title: newLinkTitle.trim(),
        url: trimmedUrl,
        description: newLinkDesc.trim(),
      },
    ]);
    setNewLinkTitle("");
    setNewLinkUrl("");
    setNewLinkDesc("");
  }

  function handleRemoveLink(index) {
    setLinks((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Handle queuing a document file for upload
  function handleQueueFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert("File size exceeds maximum allowed limit of 25MB.");
      return;
    }

    const defaultTitle = file.name.replace(/\.[^/.]+$/, "");
    setPendingUploads((prev) => [
      ...prev,
      {
        file,
        title: defaultTitle,
        description: "",
      },
    ]);
    e.target.value = "";
  }

  function handleRemovePendingUpload(index) {
    setPendingUploads((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Delete existing document in Edit mode
  async function handleDeleteExistingDoc(docId) {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      await api.delete(`/api/projects/${projectId}/documents/${docId}`);
      setExistingDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      alert(
        "Failed to delete document: " +
          (err.response?.data?.detail || err.message),
      );
    }
  }

  // Replace existing document file in Edit mode
  async function handleReplaceExistingDoc(docId, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post(
        `/api/projects/${projectId}/documents/${docId}/replace`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setExistingDocs((prev) =>
        prev.map((d) => (d.id === docId ? res.data : d)),
      );
      alert("Document file replaced successfully.");
    } catch (err) {
      alert("Failed to replace document: " + (err.response?.data?.detail || err.message));
    }
    e.target.value = "";
  }

  // Save document metadata edit
  async function handleSaveDocMetadata() {
    if (!editingDoc) return;
    try {
      const res = await api.patch(
        `/api/projects/${projectId}/documents/${editingDoc.id}`,
        {
          title: editDocTitle.trim(),
          description: editDocDesc.trim() || null,
        },
      );
      setExistingDocs((prev) =>
        prev.map((d) => (d.id === editingDoc.id ? res.data : d)),
      );
      setEditingDoc(null);
    } catch (err) {
      alert("Failed to update document: " + (err.response?.data?.detail || err.message));
    }
  }

  // Download helper
  async function handleDownloadDoc(doc) {
    try {
      const response = await api.get(
        `/api/projects/${projectId}/documents/${doc.id}/download`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", doc.file_name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download document: " + (err.response?.data?.detail || err.message));
    }
  }

  // Form Submit
  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setPageError("");
    setSuccessMsg("");

    const managerUserId = managerId ? parseInt(managerId, 10) : null;

    try {
      let savedProjectId = projectId;

      if (isEdit) {
        // Update project: do not send member_ids so memberships are preserved
        const payload = {
          name: name.trim(),
          description: description.trim(),
          client_name: clientName.trim() || null,
          department,
          status,
          start_date: startDate,
          end_date: endDate,
          manager_id: managerUserId,
        };

        const res = await api.patch(`/api/projects/${projectId}`, payload);
        savedProjectId = res.data.id;

        // Sync links: add any links that don't have an ID
        for (const l of links) {
          if (!l.id) {
            await api.post(`/api/projects/${savedProjectId}/links`, {
              title: l.title,
              url: l.url,
              description: l.description || null,
            });
          }
        }
      } else {
        // Create project: no team members selected
        const payload = {
          name: name.trim(),
          description: description.trim(),
          client_name: clientName.trim() || null,
          department,
          status,
          start_date: startDate,
          end_date: endDate,
          manager_id: managerUserId,
          member_ids: [],
          links: links.map((l) => ({
            title: l.title,
            url: l.url,
            description: l.description || null,
          })),
        };

        const res = await api.post("/api/projects", payload);
        savedProjectId = res.data.id;
      }

      // Upload any pending documents
      if (pendingUploads.length > 0) {
        for (const item of pendingUploads) {
          const formData = new FormData();
          formData.append("file", item.file);
          formData.append("title", item.title);
          if (item.description) {
            formData.append("description", item.description);
          }
          await api.post(
            `/api/projects/${savedProjectId}/documents`,
            formData,
            { headers: { "Content-Type": "multipart/form-data" } },
          );
        }
      }

      setSuccessMsg(isEdit ? "Project updated successfully!" : "Project created successfully!");
      setTimeout(() => {
        navigate(`${basePath}/projects/${savedProjectId}`);
      }, 700);
    } catch (err) {
      setPageError(
        typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "An error occurred while saving the project.",
      );
      setSaving(false);
    }
  }

  // Filter available managers (admins and managers)
  const availableManagers = availableUsers.filter(
    (u) => u.role === "admin" || u.role === "manager",
  );

  // Filter available team members by search query
  const filteredUsers = availableUsers.filter((u) => {
    if (!memberSearchQuery.trim()) return true;
    const q = memberSearchQuery.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.department?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="project-form-page">
        <Link to={`${basePath}/projects`} className="back-nav-link">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back to Projects</span>
        </Link>
        <div className="projects-loading-state" role="status">
          <Clock size={28} className="animate-spin text-lime-600" />
          <p>Loading project form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="project-form-page">
      {/* Back button */}
      <Link
        to={isEdit ? `${basePath}/projects/${projectId}` : `${basePath}/projects`}
        className="back-nav-link"
        id="back-nav-btn"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        <span>{isEdit ? "Back to Project Details" : "Back to Projects"}</span>
      </Link>

      <form onSubmit={handleSubmit} className="project-form-card" noValidate>
        {/* Form Title */}
        <div className="form-section-header">
          <div>
            <h2>{isEdit ? "Edit Project" : "Add New Project"}</h2>
            <p>
              {isEdit
                ? "Update project details, and manage documents & links."
                : "Fill out the fields below to create a new project."}
            </p>
          </div>
        </div>

        {/* Alerts */}
        {pageError && (
          <div className="alert-banner error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{pageError}</span>
          </div>
        )}
        {successMsg && (
          <div className="alert-banner success" role="status">
            <Check size={18} aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Section 1: Basic Information */}
        <section className="form-section" aria-label="Basic project details">
          <div className="form-section-header">
            <h3>Basic Details</h3>
            <p>Core project identification, client, schedule, and unit.</p>
          </div>

          <div className="form-group">
            <label htmlFor="project-name">
              Project Name <span className="required-asterisk">*</span>
            </label>
            <input
              id="project-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. TaskFlow System Overhaul"
            />
            {fieldErrors.name && (
              <span className="form-field-error">{fieldErrors.name}</span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="project-desc">
              Project Description <span className="required-asterisk">*</span>
            </label>
            <textarea
              id="project-desc"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide an overview of the project objectives and scope..."
              rows={3}
            />
            {fieldErrors.description && (
              <span className="form-field-error">{fieldErrors.description}</span>
            )}
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="client-name">Client / Company Name</label>
              <input
                id="client-name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Ingage Technologies"
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-dept">
                Department / Company Unit <span className="required-asterisk">*</span>
              </label>
              <select
                id="project-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              >
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid-3">
            <div className="form-group">
              <label htmlFor="project-status">Project Status</label>
              <select
                id="project-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="start-date">
                Start Date <span className="required-asterisk">*</span>
              </label>
              <input
                id="start-date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {fieldErrors.startDate && (
                <span className="form-field-error">{fieldErrors.startDate}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="end-date">
                End Date <span className="required-asterisk">*</span>
              </label>
              <input
                id="end-date"
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              {fieldErrors.endDate && (
                <span className="form-field-error">{fieldErrors.endDate}</span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="project-manager">Project Manager</label>
            <select
              id="project-manager"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              <option value="">Select an authorized Manager or Admin...</option>
              {availableManagers.map((mgr) => (
                <option key={mgr.id} value={mgr.id}>
                  {mgr.full_name} ({mgr.role} - {mgr.email})
                </option>
              ))}
            </select>
          </div>
        </section>


        {/* Section 3: Project Documents */}
        <section className="form-section" aria-label="Project documents">
          <div className="form-section-header">
            <h3>Project Documents</h3>
            <p>Attach relevant documents (DOC, DOCX, PDF, XLS, XLSX, PPTX, max 25MB).</p>
          </div>

          {/* Existing Documents in Edit Mode */}
          {isEdit && existingDocs.length > 0 && (
            <div className="documents-list mb-3">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                Existing Documents ({existingDocs.length})
              </span>
              {existingDocs.map((doc) => (
                <div key={doc.id} className="document-item-row">
                  <div className="doc-left">
                    <FileText size={20} className="doc-icon" />
                    <div className="doc-details">
                      <span className="doc-title">{doc.title}</span>
                      <span className="doc-meta">
                        {doc.file_name} • {(doc.file_size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>
                  <div className="doc-actions">
                    <button
                      type="button"
                      className="icon-action-btn"
                      title="Download document"
                      onClick={() => handleDownloadDoc(doc)}
                    >
                      <Download size={15} aria-hidden="true" />
                    </button>
                    <label
                      className="icon-action-btn"
                      title="Replace file"
                      style={{ cursor: "pointer" }}
                    >
                      <RefreshCw size={15} aria-hidden="true" />
                      <input
                        type="file"
                        style={{ display: "none" }}
                        onChange={(e) => handleReplaceExistingDoc(doc.id, e)}
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-action-btn delete"
                      title="Delete document"
                      onClick={() => handleDeleteExistingDoc(doc.id)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* New Document Uploader */}
          <label className="file-upload-zone">
            <Upload size={28} className="mx-auto mb-2 text-lime-600" aria-hidden="true" />
            <span className="font-semibold text-gray-800 text-sm block">
              Click to select and attach document files
            </span>
            <span className="text-xs text-gray-500 block mt-1">
              Supported: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX (max 25MB)
            </span>
            <input
              type="file"
              className="file-upload-input"
              onChange={handleQueueFile}
            />
          </label>

          {/* Pending uploads queue */}
          {pendingUploads.length > 0 && (
            <div className="upload-queue-list">
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                Files to Upload ({pendingUploads.length})
              </span>
              {pendingUploads.map((item, idx) => (
                <div key={idx} className="upload-queue-item">
                  <div className="flex flex-col gap-1 w-full max-w-sm mr-2">
                    <input
                      type="text"
                      className="text-xs border rounded p-1"
                      value={item.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPendingUploads((prev) =>
                          prev.map((it, i) =>
                            i === idx ? { ...it, title: val } : it,
                          ),
                        );
                      }}
                      placeholder="Document title"
                    />
                    <span className="text-xs text-gray-400">
                      {item.file.name} ({(item.file.size / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    className="icon-action-btn delete"
                    onClick={() => handleRemovePendingUpload(idx)}
                    title="Remove from upload queue"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 4: External Project Links */}
        <section className="form-section" aria-label="External project links">
          <div className="form-section-header">
            <h3>External Project Links</h3>
            <p>Add URLs to repositories, Jira boards, design prototypes, etc.</p>
          </div>

          {/* Links List */}
          {links.length > 0 && (
            <div className="links-list mb-3">
              {links.map((link, idx) => (
                <div key={idx} className="link-item-row">
                  <div className="link-left">
                    <span className="link-title">{link.title}</span>
                    <span className="link-url">{link.url}</span>
                    {link.description && (
                      <span className="link-desc">{link.description}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-action-btn delete"
                    onClick={() => handleRemoveLink(idx)}
                    title="Remove link"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Link Input Group */}
          <div className="bg-gray-50 border border-gray-200 rounded p-4 flex flex-col gap-3">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              Add a Link
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Link Title (e.g. Jira Board, Design Spec)"
                value={newLinkTitle}
                onChange={(e) => setNewLinkTitle(e.target.value)}
                className="text-sm p-2 border rounded"
              />
              <input
                type="url"
                placeholder="URL (https://...)"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                className="text-sm p-2 border rounded"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Optional description"
                value={newLinkDesc}
                onChange={(e) => setNewLinkDesc(e.target.value)}
                className="text-sm p-2 border rounded flex-1"
              />
              <button
                type="button"
                onClick={handleAddLink}
                className="projects-secondary-btn"
                style={{ flexShrink: 0 }}
              >
                <Plus size={15} aria-hidden="true" />
                <span>Add Link</span>
              </button>
            </div>
          </div>
        </section>

        {/* Action Buttons */}
        <div className="form-actions-bar">
          <Link
            to={isEdit ? `${basePath}/projects/${projectId}` : `${basePath}/projects`}
            className="projects-secondary-btn"
            id="cancel-btn"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="projects-primary-btn"
            id="save-project-btn"
          >
            {saving ? (
              <>
                <Clock size={16} className="animate-spin" aria-hidden="true" />
                <span>{isEdit ? "Saving..." : "Creating..."}</span>
              </>
            ) : (
              <span>{isEdit ? "Save Changes" : "Create Project"}</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
