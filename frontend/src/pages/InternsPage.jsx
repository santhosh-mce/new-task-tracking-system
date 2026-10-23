import { useEffect, useState, useMemo, useCallback } from "react";
import {
  GraduationCap,
  Users,
  UserCheck,
  UserX,
  Clock,
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  Edit2,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Briefcase,
  Calendar,
  Phone,
  Building2,
  RefreshCw,
  FolderGit2,
  ListTodo,
  AlertTriangle,
  Award,
} from "lucide-react";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";
import "./StaffManagement.css";

export default function InternsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Data states
  const [stats, setStats] = useState({
    total_interns: 0,
    active_interns: 0,
    completed_interns: 0,
    inactive_interns: 0,
    ending_soon: 0,
  });
  const [interns, setInterns] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [projectsList, setProjectsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & pagination states
  const [search, setSearch] = useState("");
  const [mentorFilter, setMentorFilter] = useState("All");
  const [projectFilter, setProjectFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [department, setDepartment] = useState("All");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Modal states
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedIntern, setSelectedIntern] = useState(null);
  const [internDetails, setInternDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Form states for Add Intern
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    college: "",
    department: "Ingage",
    mentor_id: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    mobile: "",
    work_location: "Chennai Office",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form states for Edit Intern
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    college: "",
    department: "Ingage",
    mentor_id: "",
    start_date: "",
    end_date: "",
    mobile: "",
    work_location: "",
    skills: "",
    internship_status: "Active",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Notification feedback
  const [notification, setNotification] = useState({ type: "", message: "" });
  const notify = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: "", message: "" }), 4000);
  };

  // Fetch Stats & Dropdown Options
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await api.get("/api/interns/stats");
      setStats(res.data);
    } catch (err) {
      console.error("Failed to fetch intern stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [mentorRes, projRes] = await Promise.all([
        api.get("/api/interns/mentors"),
        api.get("/api/interns/projects"),
      ]);
      setMentors(mentorRes.data || []);
      setProjectsList(projRes.data || []);
    } catch (err) {
      console.error("Failed to fetch mentors/projects dropdowns:", err);
    }
  }, []);

  // Fetch Interns List
  const fetchInterns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_dir: sortDir,
      };
      if (search.trim()) params.q = search.trim();
      if (mentorFilter !== "All") params.mentor_id = parseInt(mentorFilter, 10);
      if (projectFilter !== "All") params.project_id = parseInt(projectFilter, 10);
      if (statusFilter !== "All") params.status = statusFilter;
      if (department !== "All") params.department = department;

      const res = await api.get("/api/interns", { params });
      setInterns(res.data.items || []);
      setTotalPages(res.data.pages || 1);
      setTotalItems(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load interns:", err);
      setError("Unable to load interns. Please check your network.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, search, mentorFilter, projectFilter, statusFilter, department]);

  useEffect(() => {
    fetchStats();
    fetchDropdowns();
  }, [fetchStats, fetchDropdowns]);

  useEffect(() => {
    fetchInterns();
  }, [fetchInterns]);

  // Load intern full details
  const handleViewDetails = async (intern) => {
    setSelectedIntern(intern);
    setDetailModalOpen(true);
    setDetailsLoading(true);
    setActiveTab("overview");
    try {
      const res = await api.get(`/api/interns/${intern.id}`);
      setInternDetails(res.data);
    } catch (err) {
      console.error("Failed to load intern details:", err);
      notify("error", "Failed to fetch full intern profile.");
    } finally {
      setDetailsLoading(false);
    }
  };

  // Open edit modal
  const handleOpenEdit = (intern) => {
    setSelectedIntern(intern);
    setEditFormData({
      full_name: intern.full_name || "",
      college: intern.college || "",
      department: intern.department || "Ingage",
      mentor_id: intern.mentor?.id ? String(intern.mentor.id) : "",
      start_date: intern.internship_start_date || "",
      end_date: intern.internship_end_date || "",
      mobile: intern.mobile || "",
      work_location: intern.work_location || "",
      skills: intern.skills ? (Array.isArray(intern.skills) ? intern.skills.join(", ") : intern.skills) : "",
      internship_status: intern.internship_status === "Ending Soon" ? "Active" : (intern.internship_status || "Active"),
    });
    setEditError("");
    setEditModalOpen(true);
  };

  // Submit Add Intern
  const handleCreateIntern = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError("");

    if (!formData.email || !formData.full_name || !formData.password) {
      setFormError("Email, Full Name, and Password are required.");
      setFormSubmitting(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        mentor_id: formData.mentor_id ? parseInt(formData.mentor_id, 10) : null,
      };
      await api.post("/api/interns", payload);
      notify("success", `Intern ${formData.full_name} created successfully.`);
      setAddModalOpen(false);
      setFormData({
        email: "",
        password: "",
        full_name: "",
        college: "",
        department: "Ingage",
        mentor_id: "",
        start_date: new Date().toISOString().split("T")[0],
        end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        mobile: "",
        work_location: "Chennai Office",
      });
      fetchInterns();
      fetchStats();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to create intern.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Submit Edit Intern
  const handleUpdateIntern = async (e) => {
    e.preventDefault();
    if (!selectedIntern) return;
    setEditSubmitting(true);
    setEditError("");

    try {
      const payload = {
        ...editFormData,
        mentor_id: editFormData.mentor_id ? parseInt(editFormData.mentor_id, 10) : null,
      };
      await api.patch(`/api/interns/${selectedIntern.id}`, payload);
      notify("success", "Intern details updated successfully.");
      setEditModalOpen(false);
      fetchInterns();
      fetchStats();
    } catch (err) {
      setEditError(err.response?.data?.detail || "Failed to update intern.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Mark Completed Action
  const handleMarkCompleted = async (intern) => {
    if (!window.confirm(`Mark internship for ${intern.full_name} as COMPLETED?`)) {
      return;
    }

    try {
      await api.patch(`/api/interns/${intern.id}/status`, { internship_status: "Completed" });
      notify("success", `Internship marked as Completed for ${intern.full_name}.`);
      fetchInterns();
      fetchStats();
    } catch (err) {
      notify("error", err.response?.data?.detail || "Failed to update internship status.");
    }
  };

  // Toggle Account Active / Inactive
  const handleToggleAccount = async (intern) => {
    const newStatus = intern.account_status === "active" ? "inactive" : "active";
    const action = newStatus === "active" ? "activate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${action} ${intern.full_name}?`)) {
      return;
    }

    try {
      await api.patch(`/api/interns/${intern.id}/status`, { account_status: newStatus });
      notify("success", `Intern account successfully ${newStatus === "active" ? "activated" : "deactivated"}.`);
      fetchInterns();
      fetchStats();
    } catch (err) {
      notify("error", err.response?.data?.detail || "Failed to toggle intern account.");
    }
  };

  // Generate random password
  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*";
    let pass = "TaskFlow@";
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, password: pass }));
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!interns.length) return;
    const headers = [
      "Intern ID",
      "Full Name",
      "Email",
      "College / University",
      "Department",
      "Assigned Mentor",
      "Start Date",
      "End Date",
      "Duration (Weeks)",
      "Task Progress",
      "Status",
    ];

    const rows = interns.map((item) => [
      `"${item.intern_id || ""}"`,
      `"${item.full_name || ""}"`,
      `"${item.email || ""}"`,
      `"${item.college || ""}"`,
      `"${item.department || ""}"`,
      `"${item.mentor?.full_name || "Unassigned"}"`,
      `"${item.internship_start_date || ""}"`,
      `"${item.internship_end_date || ""}"`,
      `"${item.duration_weeks || "—"}"`,
      `"${item.task_completion_progress}%"`,
      `"${item.internship_status || ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `interns_export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="staff-management-page">
      {/* Toast Notification */}
      {notification.message && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1100,
            padding: "12px 18px",
            borderRadius: "8px",
            backgroundColor: notification.type === "success" ? "#65a30d" : "#ef4444",
            color: "#ffffff",
            fontWeight: "600",
            fontSize: "0.86rem",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {notification.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="staff-page-header">
        <div className="staff-header-content">
          <p className="staff-eyebrow">Ingage TaskFlow · Campus & Internships</p>
          <h1>Interns Management</h1>
          <p className="staff-subtitle">
            Track student internships, mentors, assigned deliverables, task progress, and upcoming completion dates.
          </p>
        </div>
        <div className="staff-header-actions">
          <button className="staff-btn staff-btn-secondary" onClick={handleExportCSV} title="Export to CSV">
            <Download size={16} />
            Export CSV
          </button>
          {isAdmin && (
            <button className="staff-btn staff-btn-primary" onClick={() => setAddModalOpen(true)}>
              <Plus size={16} />
              Add Intern
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards Grid */}
      <div className="staff-stats-grid">
        <div className="staff-stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Interns</span>
            <div className="stat-icon purple">
              <GraduationCap size={18} />
            </div>
          </div>
          <div className="stat-number">{statsLoading ? "—" : stats.total_interns}</div>
          <div className="stat-footnote">Enrolled interns</div>
        </div>

        <div className="staff-stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Active Interns</span>
            <div className="stat-icon">
              <UserCheck size={18} />
            </div>
          </div>
          <div className="stat-number">{statsLoading ? "—" : stats.active_interns}</div>
          <div className="stat-footnote">Currently working</div>
        </div>

        <div className="staff-stat-card alert-card">
          <div className="stat-card-top">
            <span className="stat-label">Ending Soon</span>
            <div className="stat-icon alert">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="stat-number" style={{ color: "#d97706" }}>
            {statsLoading ? "—" : stats.ending_soon}
          </div>
          <div className="stat-footnote">Finishing within 14 days</div>
        </div>

        <div className="staff-stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Completed</span>
            <div className="stat-icon blue">
              <Award size={18} />
            </div>
          </div>
          <div className="stat-number">{statsLoading ? "—" : stats.completed_interns}</div>
          <div className="stat-footnote">Finished internships</div>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="staff-filters-panel">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name, email, college, intern ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <select
          className="staff-filter-select"
          value={mentorFilter}
          onChange={(e) => {
            setMentorFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by mentor"
        >
          <option value="All">All Mentors</option>
          {mentors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name} ({m.department})
            </option>
          ))}
        </select>

        <select
          className="staff-filter-select"
          value={projectFilter}
          onChange={(e) => {
            setProjectFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by project"
        >
          <option value="All">All Projects</option>
          {projectsList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <select
          className="staff-filter-select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Ending Soon">Ending Soon (&le; 14 days)</option>
          <option value="Completed">Completed</option>
          <option value="Inactive">Inactive</option>
        </select>

        <select
          className="staff-filter-select"
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by department"
        >
          <option value="All">All Departments</option>
          <option value="Ingage">Ingage</option>
          <option value="Rezov">Rezov</option>
          <option value="Edutech">Edutech</option>
        </select>

        <select
          className="staff-filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort interns by"
        >
          <option value="name">Sort by Name</option>
          <option value="intern_id">Sort by Intern ID</option>
          <option value="start_date">Sort by Start Date</option>
          <option value="end_date">Sort by End Date</option>
          <option value="college">Sort by College</option>
        </select>

        {(search || mentorFilter !== "All" || projectFilter !== "All" || statusFilter !== "All" || department !== "All") && (
          <button
            className="clear-filters-btn"
            onClick={() => {
              setSearch("");
              setMentorFilter("All");
              setProjectFilter("All");
              setStatusFilter("All");
              setDepartment("All");
              setPage(1);
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Interns Table Card */}
      <div className="staff-table-card">
        {loading ? (
          <div className="staff-empty-state">
            <RefreshCw size={32} className="spin-icon" style={{ animation: "spin 1s linear infinite" }} />
            <h3>Loading interns...</h3>
            <p>Fetching internship records from database.</p>
          </div>
        ) : error ? (
          <div className="staff-empty-state">
            <AlertCircle size={32} color="#ef4444" />
            <h3>Error Loading Interns</h3>
            <p>{error}</p>
            <button className="staff-btn staff-btn-secondary" style={{ marginTop: "12px" }} onClick={fetchInterns}>
              Retry
            </button>
          </div>
        ) : interns.length === 0 ? (
          <div className="staff-empty-state">
            <GraduationCap size={36} />
            <h3>No Interns Found</h3>
            <p>Try adjusting your search criteria or filters.</p>
          </div>
        ) : (
          <div className="staff-table-wrapper">
            <table className="staff-data-table">
              <thead>
                <tr>
                  <th>Intern ID</th>
                  <th>Intern Name</th>
                  <th>College / University</th>
                  <th>Assigned Mentor</th>
                  <th>Assigned Project(s)</th>
                  <th>Timeline</th>
                  <th>Task Progress</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {interns.map((item) => {
                  const initial = (item.full_name || item.email || "I").charAt(0).toUpperCase();
                  const isEndingSoon = item.is_ending_soon;

                  return (
                    <tr key={item.id} className={isEndingSoon ? "ending-soon-row" : ""}>
                      <td>
                        <span className="id-badge">{item.intern_id}</span>
                      </td>
                      <td>
                        <div className="user-identity-cell">
                          <div className="user-avatar" style={{ background: "#3b82f6" }}>
                            {initial}
                          </div>
                          <div className="user-name-group">
                            <strong>{item.full_name}</strong>
                            <small>{item.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong style={{ fontSize: "0.82rem", color: "#374151" }}>
                          {item.college || "Not specified"}
                        </strong>
                        <small style={{ display: "block", color: "#6b7280" }}>{item.department}</small>
                      </td>
                      <td>
                        {item.mentor ? (
                          <div>
                            <span style={{ fontWeight: "650" }}>{item.mentor.full_name}</span>
                            <small style={{ display: "block", color: "#9ca3af" }}>{item.mentor.email}</small>
                          </div>
                        ) : (
                          <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No mentor</span>
                        )}
                      </td>
                      <td>
                        {item.assigned_projects && item.assigned_projects.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {item.assigned_projects.slice(0, 1).map((p) => (
                              <span
                                key={p.id}
                                style={{
                                  background: "#f3f4f6",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontSize: "0.74rem",
                                }}
                              >
                                {p.name}
                              </span>
                            ))}
                            {item.assigned_projects.length > 1 && (
                              <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                                +{item.assigned_projects.length - 1} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>None</span>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: "0.78rem" }}>
                          <div>Start: <strong>{item.internship_start_date || "—"}</strong></div>
                          <div>
                            End:{" "}
                            <strong style={{ color: isEndingSoon ? "#b45309" : "inherit" }}>
                              {item.internship_end_date || "—"}
                            </strong>
                            {isEndingSoon && (
                              <span style={{ color: "#d97706", fontWeight: "700", marginLeft: "4px" }}>
                                ({item.days_remaining}d left)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="task-progress-cell">
                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${item.task_completion_progress}%`,
                              backgroundColor: item.task_completion_progress >= 80 ? "#22c55e" : "#65a30d",
                            }}
                          />
                        </div>
                        <div className="progress-label-small">
                          {item.task_completion_progress}% ({item.completed_tasks_count}/{item.tasks_count} tasks)
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${item.internship_status.toLowerCase().replace(/\s+/g, "-")}`}>
                          {item.internship_status}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="action-icon-btn"
                            title="View Intern Profile"
                            onClick={() => handleViewDetails(item)}
                          >
                            <Eye size={15} />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                className="action-icon-btn"
                                title="Edit Intern"
                                onClick={() => handleOpenEdit(item)}
                              >
                                <Edit2 size={15} />
                              </button>
                              {item.internship_status !== "Completed" && (
                                <button
                                  className="action-icon-btn"
                                  title="Mark Internship as Completed"
                                  onClick={() => handleMarkCompleted(item)}
                                >
                                  <Award size={15} />
                                </button>
                              )}
                              <button
                                className={`action-icon-btn ${item.account_status === "active" ? "danger" : ""}`}
                                title={item.account_status === "active" ? "Deactivate Account" : "Activate Account"}
                                onClick={() => handleToggleAccount(item)}
                              >
                                {item.account_status === "active" ? <UserX size={15} /> : <UserCheck size={15} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && interns.length > 0 && (
          <div className="staff-pagination-bar">
            <span>
              Showing <strong>{(page - 1) * pageSize + 1}</strong> to{" "}
              <strong>{Math.min(page * pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> interns
            </span>
            <div className="pagination-controls">
              <button
                className="page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  className={`page-btn ${p === page ? "active" : ""}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
              <button
                className="page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Intern Modal */}
      {addModalOpen && (
        <div className="modal-overlay" onClick={() => !formSubmitting && setAddModalOpen(false)}>
          <div className="staff-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Intern</h2>
              <button className="modal-close-btn" onClick={() => setAddModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateIntern}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px", borderRadius: "6px", marginBottom: "14px", fontSize: "0.82rem" }}>
                    {formError}
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-field full-width">
                    <label>Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="intern@university.edu"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label>Login Password *</label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="Minimum 8 characters"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="staff-btn staff-btn-secondary"
                        onClick={generatePassword}
                        style={{ minHeight: "40px" }}
                      >
                        Generate
                      </button>
                      <button
                        type="button"
                        className="staff-btn staff-btn-secondary"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ minHeight: "40px" }}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                  </div>

                  <div className="form-field full-width">
                    <label>College / University</label>
                    <input
                      type="text"
                      placeholder="e.g. Anna University, IIT, BITS"
                      value={formData.college}
                      onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>Department</label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    >
                      <option value="Ingage">Ingage</option>
                      <option value="Rezov">Rezov</option>
                      <option value="Edutech">Edutech</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Assigned Mentor</label>
                    <select
                      value={formData.mentor_id}
                      onChange={(e) => setFormData({ ...formData, mentor_id: e.target.value })}
                    >
                      <option value="">No mentor assigned</option>
                      {mentors.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name} ({m.department})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Start Date</label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>End Date</label>
                    <input
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label>Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={formData.mobile}
                      onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="staff-btn staff-btn-secondary"
                  disabled={formSubmitting}
                  onClick={() => setAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="staff-btn staff-btn-primary" disabled={formSubmitting}>
                  {formSubmitting ? "Creating..." : "Create Intern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Intern Modal */}
      {editModalOpen && selectedIntern && (
        <div className="modal-overlay" onClick={() => !editSubmitting && setEditModalOpen(false)}>
          <div className="staff-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Intern · {selectedIntern.intern_id}</h2>
              <button className="modal-close-btn" onClick={() => setEditModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdateIntern}>
              <div className="modal-body">
                {editError && (
                  <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px", borderRadius: "6px", marginBottom: "14px", fontSize: "0.82rem" }}>
                    {editError}
                  </div>
                )}
                <div className="form-grid">
                  <div className="form-field full-width">
                    <label>Full Name</label>
                    <input
                      type="text"
                      value={editFormData.full_name}
                      onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label>College / University</label>
                    <input
                      type="text"
                      value={editFormData.college}
                      onChange={(e) => setEditFormData({ ...editFormData, college: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>Department</label>
                    <select
                      value={editFormData.department}
                      onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    >
                      <option value="Ingage">Ingage</option>
                      <option value="Rezov">Rezov</option>
                      <option value="Edutech">Edutech</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Assigned Mentor</label>
                    <select
                      value={editFormData.mentor_id}
                      onChange={(e) => setEditFormData({ ...editFormData, mentor_id: e.target.value })}
                    >
                      <option value="">No mentor assigned</option>
                      {mentors.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Start Date</label>
                    <input
                      type="date"
                      value={editFormData.start_date}
                      onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>End Date</label>
                    <input
                      type="date"
                      value={editFormData.end_date}
                      onChange={(e) => setEditFormData({ ...editFormData, end_date: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>Internship Status</label>
                    <select
                      value={editFormData.internship_status}
                      onChange={(e) => setEditFormData({ ...editFormData, internship_status: e.target.value })}
                    >
                      <option value="Active">Active</option>
                      <option value="Completed">Completed</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Phone Number</label>
                    <input
                      type="text"
                      value={editFormData.mobile}
                      onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label>Skills & Interests</label>
                    <input
                      type="text"
                      placeholder="React, Python, Machine Learning"
                      value={editFormData.skills}
                      onChange={(e) => setEditFormData({ ...editFormData, skills: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="staff-btn staff-btn-secondary"
                  disabled={editSubmitting}
                  onClick={() => setEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="staff-btn staff-btn-primary" disabled={editSubmitting}>
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Intern Detail Modal with Tabs */}
      {detailModalOpen && selectedIntern && (
        <div className="modal-overlay" onClick={() => setDetailModalOpen(false)}>
          <div className="staff-modal-card wide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{selectedIntern.full_name}</h2>
                <small style={{ color: "#6b7280" }}>
                  {selectedIntern.intern_id} · {selectedIntern.college || "Intern"} · {selectedIntern.department}
                </small>
              </div>
              <button className="modal-close-btn" onClick={() => setDetailModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Tab Navigation */}
              <div className="profile-tabs-header">
                <button
                  className={`profile-tab-btn ${activeTab === "overview" ? "active" : ""}`}
                  onClick={() => setActiveTab("overview")}
                >
                  <GraduationCap size={15} /> Internship & Profile
                </button>
                <button
                  className={`profile-tab-btn ${activeTab === "projects" ? "active" : ""}`}
                  onClick={() => setActiveTab("projects")}
                >
                  <FolderGit2 size={15} /> Assigned Projects ({internDetails?.assigned_projects?.length || 0})
                </button>
                <button
                  className={`profile-tab-btn ${activeTab === "tasks" ? "active" : ""}`}
                  onClick={() => setActiveTab("tasks")}
                >
                  <ListTodo size={15} /> Tasks & Deliverables ({internDetails?.total_tasks || 0})
                </button>
                <button
                  className={`profile-tab-btn ${activeTab === "attendance" ? "active" : ""}`}
                  onClick={() => setActiveTab("attendance")}
                >
                  <Clock size={15} /> Attendance History
                </button>
              </div>

              {detailsLoading ? (
                <div style={{ textAlign: "center", padding: "40px" }}>
                  <RefreshCw size={28} className="spin-icon" style={{ animation: "spin 1s linear infinite" }} />
                  <p style={{ marginTop: "10px", color: "#6b7280" }}>Loading complete internship profile...</p>
                </div>
              ) : internDetails ? (
                <div>
                  {/* Tab 1: Overview & Profile */}
                  {activeTab === "overview" && (
                    <div style={{ display: "grid", gap: "16px" }}>
                      {internDetails.is_ending_soon && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "12px 16px",
                            background: "#fef3c7",
                            border: "1px solid #f59e0b",
                            borderRadius: "8px",
                            color: "#92400e",
                            fontWeight: "600",
                            fontSize: "0.84rem",
                          }}
                        >
                          <AlertTriangle size={18} />
                          <span>
                            This internship ends soon ({internDetails.days_remaining} calendar days remaining). Please prepare the evaluation review and completion certificate.
                          </span>
                        </div>
                      )}

                      <div className="detail-info-grid">
                        <div className="detail-item">
                          <span>Full Name</span>
                          <strong>{internDetails.full_name}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Email Address</span>
                          <strong>{internDetails.email}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Intern ID</span>
                          <strong>{internDetails.intern_id}</strong>
                        </div>
                        <div className="detail-item">
                          <span>College / Institution</span>
                          <strong>{internDetails.college || "Not specified"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Department</span>
                          <strong>{internDetails.department || "Ingage"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Assigned Mentor</span>
                          <strong>{internDetails.mentor?.full_name || "Unassigned"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Start Date</span>
                          <strong>{internDetails.internship_start_date || "—"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>End Date</span>
                          <strong style={{ color: internDetails.is_ending_soon ? "#b45309" : "inherit" }}>
                            {internDetails.internship_end_date || "—"}
                          </strong>
                        </div>
                        <div className="detail-item">
                          <span>Duration</span>
                          <strong>{internDetails.duration_weeks ? `${internDetails.duration_weeks} weeks` : "Ongoing"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Internship Status</span>
                          <span className={`status-pill ${internDetails.internship_status.toLowerCase().replace(/\s+/g, "-")}`}>
                            {internDetails.internship_status}
                          </span>
                        </div>
                        <div className="detail-item">
                          <span>Phone Number</span>
                          <strong>{internDetails.mobile || "Not provided"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Overall Progress</span>
                          <strong>{internDetails.task_completion_progress}% complete</strong>
                        </div>
                      </div>

                      {internDetails.skills && internDetails.skills.length > 0 && (
                        <div style={{ padding: "14px 18px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                          <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: "700", color: "#6b7280", display: "block", marginBottom: "8px" }}>
                            Skills & Learning Focus
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {internDetails.skills.map((s, idx) => (
                              <span
                                key={idx}
                                style={{
                                  background: "#ffffff",
                                  border: "1px solid #d1d5db",
                                  padding: "3px 10px",
                                  borderRadius: "6px",
                                  fontSize: "0.78rem",
                                  fontWeight: "600",
                                }}
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 2: Assigned Projects */}
                  {activeTab === "projects" && (
                    <div>
                      {internDetails.assigned_projects && internDetails.assigned_projects.length > 0 ? (
                        <div style={{ display: "grid", gap: "10px" }}>
                          {internDetails.assigned_projects.map((proj) => (
                            <div
                              key={proj.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "12px 16px",
                                background: "#f9fafb",
                                border: "1px solid #e5e7eb",
                                borderRadius: "8px",
                              }}
                            >
                              <div>
                                <strong style={{ fontSize: "0.88rem" }}>{proj.name}</strong>
                                <small style={{ display: "block", color: "#6b7280" }}>
                                  Department: {proj.department}
                                </small>
                              </div>
                              <span className="status-pill active">{proj.status}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ textAlign: "center", color: "#9ca3af", padding: "30px 0" }}>
                          No projects currently assigned to this intern.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Tab 3: Tasks & Deliverables */}
                  {activeTab === "tasks" && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "0.82rem", color: "#4b5563" }}>
                        <span>Total Assigned: <strong>{internDetails.total_tasks}</strong></span>
                        <span>Completed: <strong>{internDetails.completed_tasks}</strong></span>
                        <span>Overall Progress: <strong>{internDetails.task_completion_progress}%</strong></span>
                      </div>
                      {internDetails.tasks && internDetails.tasks.length > 0 ? (
                        <div style={{ display: "grid", gap: "10px" }}>
                          {internDetails.tasks.map((task) => (
                            <div
                              key={task.id}
                              style={{
                                padding: "12px 16px",
                                background: "#f9fafb",
                                border: "1px solid #e5e7eb",
                                borderRadius: "8px",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                                <strong style={{ fontSize: "0.86rem" }}>{task.title}</strong>
                                <span className={`status-pill ${task.status === "Completed" ? "active" : "not-checked-in"}`}>
                                  {task.status}
                                </span>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#6b7280", marginBottom: "6px" }}>
                                <span>Project: {task.project_name || "General"}</span>
                                <span>Priority: {task.priority}</span>
                                <span>Due: {task.due_date || "No deadline"}</span>
                              </div>
                              <div className="progress-track">
                                <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ textAlign: "center", color: "#9ca3af", padding: "30px 0" }}>
                          No tasks currently assigned to this intern.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Tab 4: Attendance History */}
                  {activeTab === "attendance" && (
                    <div>
                      {internDetails.attendance_history && internDetails.attendance_history.length > 0 ? (
                        <table className="staff-data-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Status</th>
                              <th>First Check In</th>
                              <th>Last Check Out</th>
                              <th>Net Work Hours</th>
                            </tr>
                          </thead>
                          <tbody>
                            {internDetails.attendance_history.map((att) => {
                              const workHours = (att.net_work_minutes / 60).toFixed(1);
                              return (
                                <tr key={att.id}>
                                  <td><strong>{att.date}</strong></td>
                                  <td>
                                    <span className={`status-pill ${att.status.toLowerCase().replace(/\s+/g, "-")}`}>
                                      {att.status}
                                    </span>
                                  </td>
                                  <td>{att.first_check_in ? new Date(att.first_check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</td>
                                  <td>{att.last_check_out ? new Date(att.last_check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"}</td>
                                  <td>{workHours} hrs</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <p style={{ textAlign: "center", color: "#9ca3af", padding: "30px 0" }}>
                          No attendance sessions recorded for this intern.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div className="modal-footer">
              <button className="staff-btn staff-btn-secondary" onClick={() => setDetailModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
