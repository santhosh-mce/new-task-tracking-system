import { useEffect, useState, useMemo, useCallback } from "react";
import {
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
  MapPin,
  Building2,
  RefreshCw,
  FolderGit2,
  ListTodo,
} from "lucide-react";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";
import "./StaffManagement.css";

export default function EmployeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Data states
  const [stats, setStats] = useState({
    total_employees: 0,
    active_employees: 0,
    inactive_employees: 0,
    present_today: 0,
    departments: [],
  });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & pagination states
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [attendanceFilter, setAttendanceFilter] = useState("All");
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
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeDetails, setEmployeeDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  // Form states for Add Employee
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    department: "Ingage",
    designation: "Software Engineer",
    joining_date: new Date().toISOString().split("T")[0],
    mobile: "",
    work_location: "Chennai Office",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form states for Edit Employee
  const [editFormData, setEditFormData] = useState({
    full_name: "",
    department: "Ingage",
    designation: "",
    mobile: "",
    work_location: "",
    joining_date: "",
    skills: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // Feedback notifications
  const [notification, setNotification] = useState({ type: "", message: "" });

  const notify = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: "", message: "" }), 4000);
  };

  // Fetch Stats
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await api.get("/api/employees/stats");
      setStats(res.data);
    } catch (err) {
      console.error("Failed to fetch employee stats:", err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch Employees List
  const fetchEmployees = useCallback(async () => {
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
      if (department !== "All") params.department = department;
      if (statusFilter !== "All") params.status = statusFilter;
      if (attendanceFilter !== "All") params.attendance_status = attendanceFilter;

      const res = await api.get("/api/employees", { params });
      setEmployees(res.data.items || []);
      setTotalPages(res.data.pages || 1);
      setTotalItems(res.data.total || 0);
    } catch (err) {
      console.error("Failed to load employees:", err);
      setError("Unable to load employees. Please verify your connection.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, search, department, statusFilter, attendanceFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Load employee full details
  const handleViewDetails = async (emp) => {
    setSelectedEmployee(emp);
    setDetailModalOpen(true);
    setDetailsLoading(true);
    setActiveTab("overview");
    try {
      const res = await api.get(`/api/employees/${emp.id}`);
      setEmployeeDetails(res.data);
    } catch (err) {
      console.error("Failed to load employee details:", err);
      notify("error", "Failed to fetch full employee profile details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  // Open edit modal
  const handleOpenEdit = (emp) => {
    setSelectedEmployee(emp);
    setEditFormData({
      full_name: emp.full_name || "",
      department: emp.department || "Ingage",
      designation: emp.designation || "",
      mobile: emp.mobile || "",
      work_location: emp.work_location || "",
      joining_date: emp.joining_date || "",
      skills: emp.skills ? (Array.isArray(emp.skills) ? emp.skills.join(", ") : emp.skills) : "",
    });
    setEditError("");
    setEditModalOpen(true);
  };

  // Submit Add Employee
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError("");

    if (!formData.email || !formData.full_name || !formData.password) {
      setFormError("Email, Full Name, and Password are required.");
      setFormSubmitting(false);
      return;
    }

    try {
      await api.post("/api/employees", formData);
      notify("success", `Employee ${formData.full_name} created successfully.`);
      setAddModalOpen(false);
      setFormData({
        email: "",
        password: "",
        full_name: "",
        department: "Ingage",
        designation: "Software Engineer",
        joining_date: new Date().toISOString().split("T")[0],
        mobile: "",
        work_location: "Chennai Office",
      });
      fetchEmployees();
      fetchStats();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to create employee.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Submit Edit Employee
  const handleUpdateEmployee = async (e) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setEditSubmitting(true);
    setEditError("");

    try {
      await api.patch(`/api/employees/${selectedEmployee.id}`, editFormData);
      notify("success", "Employee details updated successfully.");
      setEditModalOpen(false);
      fetchEmployees();
      fetchStats();
    } catch (err) {
      setEditError(err.response?.data?.detail || "Failed to update employee.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Toggle Employee Status
  const handleToggleStatus = async (emp) => {
    const newStatus = emp.status === "active" ? "inactive" : "active";
    const actionName = newStatus === "active" ? "activate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${actionName} ${emp.full_name}?`)) {
      return;
    }

    try {
      await api.patch(`/api/employees/${emp.id}/status`, { status: newStatus });
      notify("success", `Employee successfully ${newStatus === "active" ? "activated" : "deactivated"}.`);
      fetchEmployees();
      fetchStats();
    } catch (err) {
      notify("error", err.response?.data?.detail || "Failed to update employee status.");
    }
  };

  // Generate random strong password
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
    if (!employees.length) return;
    const headers = [
      "Employee ID",
      "Full Name",
      "Email",
      "Department",
      "Designation",
      "Joining Date",
      "Assigned Projects",
      "Today Attendance",
      "Status",
    ];

    const rows = employees.map((emp) => [
      `"${emp.employee_id || ""}"`,
      `"${emp.full_name || ""}"`,
      `"${emp.email || ""}"`,
      `"${emp.department || ""}"`,
      `"${emp.designation || ""}"`,
      `"${emp.joining_date || ""}"`,
      `"${emp.assigned_projects?.map((p) => p.name).join(", ") || "None"}"`,
      `"${emp.today_attendance?.status || "Not Checked In"}"`,
      `"${emp.status || ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `employees_export_${new Date().toISOString().split("T")[0]}.csv`);
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
          <p className="staff-eyebrow">Ingage TaskFlow · Workforce</p>
          <h1>Employees Management</h1>
          <p className="staff-subtitle">
            Manage your organization's permanent staff, track assignments, and view real-time attendance.
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
              Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="staff-stats-grid">
        <div className="staff-stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Employees</span>
            <div className="stat-icon">
              <Users size={18} />
            </div>
          </div>
          <div className="stat-number">{statsLoading ? "—" : stats.total_employees}</div>
          <div className="stat-footnote">Permanent staff members</div>
        </div>

        <div className="staff-stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Active Staff</span>
            <div className="stat-icon">
              <UserCheck size={18} />
            </div>
          </div>
          <div className="stat-number">{statsLoading ? "—" : stats.active_employees}</div>
          <div className="stat-footnote">Active workspace access</div>
        </div>

        <div className="staff-stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Present Today</span>
            <div className="stat-icon blue">
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-number">{statsLoading ? "—" : stats.present_today}</div>
          <div className="stat-footnote">Checked in today</div>
        </div>

        <div className="staff-stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Inactive Staff</span>
            <div className="stat-icon alert">
              <UserX size={18} />
            </div>
          </div>
          <div className="stat-number">{statsLoading ? "—" : stats.inactive_employees}</div>
          <div className="stat-footnote">Deactivated accounts</div>
        </div>
      </div>

      {/* Filters Panel */}
      <div className="staff-filters-panel">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name, email, employee ID, role..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

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
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by account status"
        >
          <option value="All">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          className="staff-filter-select"
          value={attendanceFilter}
          onChange={(e) => {
            setAttendanceFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by today attendance"
        >
          <option value="All">All Attendance</option>
          <option value="Present">Present</option>
          <option value="Late">Late</option>
          <option value="On Break">On Break</option>
          <option value="Not Checked In">Not Checked In</option>
        </select>

        <select
          className="staff-filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort employees by"
        >
          <option value="name">Sort by Name</option>
          <option value="employee_id">Sort by ID</option>
          <option value="department">Sort by Department</option>
          <option value="joining_date">Sort by Joining Date</option>
          <option value="status">Sort by Status</option>
        </select>

        {(search || department !== "All" || statusFilter !== "All" || attendanceFilter !== "All") && (
          <button
            className="clear-filters-btn"
            onClick={() => {
              setSearch("");
              setDepartment("All");
              setStatusFilter("All");
              setAttendanceFilter("All");
              setPage(1);
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table Card */}
      <div className="staff-table-card">
        {loading ? (
          <div className="staff-empty-state">
            <RefreshCw size={32} className="spin-icon" style={{ animation: "spin 1s linear infinite" }} />
            <h3>Loading employees...</h3>
            <p>Fetching real-time records from database.</p>
          </div>
        ) : error ? (
          <div className="staff-empty-state">
            <AlertCircle size={32} color="#ef4444" />
            <h3>Error Loading Employees</h3>
            <p>{error}</p>
            <button className="staff-btn staff-btn-secondary" style={{ marginTop: "12px" }} onClick={fetchEmployees}>
              Retry
            </button>
          </div>
        ) : employees.length === 0 ? (
          <div className="staff-empty-state">
            <Users size={36} />
            <h3>No Employees Found</h3>
            <p>Try adjusting your search query or filters.</p>
          </div>
        ) : (
          <div className="staff-table-wrapper">
            <table className="staff-data-table">
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Employee Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Assigned Projects</th>
                  <th>Today's Attendance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const initial = (emp.full_name || emp.email || "E").charAt(0).toUpperCase();
                  const attStatus = emp.today_attendance?.status || "Not Checked In";
                  const attClass = attStatus.toLowerCase().replace(/\s+/g, "-");

                  return (
                    <tr key={emp.id}>
                      <td>
                        <span className="id-badge">{emp.employee_id}</span>
                      </td>
                      <td>
                        <div className="user-identity-cell">
                          <div className="user-avatar">{initial}</div>
                          <div className="user-name-group">
                            <strong>{emp.full_name}</strong>
                            <small>{emp.designation}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ color: "#4b5563" }}>{emp.email}</span>
                      </td>
                      <td>
                        <strong>{emp.department || "Ingage"}</strong>
                      </td>
                      <td>{emp.designation || "Employee"}</td>
                      <td>
                        {emp.assigned_projects && emp.assigned_projects.length > 0 ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {emp.assigned_projects.slice(0, 2).map((p) => (
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
                            {emp.assigned_projects.length > 2 && (
                              <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                                +{emp.assigned_projects.length - 2} more
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>None assigned</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-pill ${attClass}`}>
                          {attStatus}
                          {emp.today_attendance?.check_in && ` (${emp.today_attendance.check_in})`}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${emp.status}`}>{emp.status}</span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="action-icon-btn"
                            title="View Employee Profile"
                            onClick={() => handleViewDetails(emp)}
                          >
                            <Eye size={15} />
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                className="action-icon-btn"
                                title="Edit Employee"
                                onClick={() => handleOpenEdit(emp)}
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                className={`action-icon-btn ${emp.status === "active" ? "danger" : ""}`}
                                title={emp.status === "active" ? "Deactivate Account" : "Activate Account"}
                                onClick={() => handleToggleStatus(emp)}
                              >
                                {emp.status === "active" ? <UserX size={15} /> : <UserCheck size={15} />}
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
        {!loading && employees.length > 0 && (
          <div className="staff-pagination-bar">
            <span>
              Showing <strong>{(page - 1) * pageSize + 1}</strong> to{" "}
              <strong>{Math.min(page * pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> employees
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

      {/* Add Employee Modal */}
      {addModalOpen && (
        <div className="modal-overlay" onClick={() => !formSubmitting && setAddModalOpen(false)}>
          <div className="staff-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Add New Employee</h2>
              <button className="modal-close-btn" onClick={() => setAddModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateEmployee}>
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
                      placeholder="e.g. John Doe"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label>Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="colleague@example.com"
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
                    <label>Designation</label>
                    <input
                      type="text"
                      placeholder="e.g. Frontend Engineer"
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>Joining Date</label>
                    <input
                      type="date"
                      value={formData.joining_date}
                      onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={formData.mobile}
                      onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label>Work Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Chennai Office, Remote"
                      value={formData.work_location}
                      onChange={(e) => setFormData({ ...formData, work_location: e.target.value })}
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
                  {formSubmitting ? "Creating..." : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editModalOpen && selectedEmployee && (
        <div className="modal-overlay" onClick={() => !editSubmitting && setEditModalOpen(false)}>
          <div className="staff-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Employee · {selectedEmployee.employee_id}</h2>
              <button className="modal-close-btn" onClick={() => setEditModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleUpdateEmployee}>
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
                    <label>Designation</label>
                    <input
                      type="text"
                      value={editFormData.designation}
                      onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>Phone Number</label>
                    <input
                      type="text"
                      value={editFormData.mobile}
                      onChange={(e) => setEditFormData({ ...editFormData, mobile: e.target.value })}
                    />
                  </div>

                  <div className="form-field">
                    <label>Work Location</label>
                    <input
                      type="text"
                      value={editFormData.work_location}
                      onChange={(e) => setEditFormData({ ...editFormData, work_location: e.target.value })}
                    />
                  </div>

                  <div className="form-field full-width">
                    <label>Skills (comma-separated)</label>
                    <input
                      type="text"
                      placeholder="React, Python, PostgreSQL, Docker"
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

      {/* Employee Detail Modal with Tabs */}
      {detailModalOpen && selectedEmployee && (
        <div className="modal-overlay" onClick={() => setDetailModalOpen(false)}>
          <div className="staff-modal-card wide-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{selectedEmployee.full_name}</h2>
                <small style={{ color: "#6b7280" }}>
                  {selectedEmployee.employee_id} · {selectedEmployee.designation} · {selectedEmployee.department}
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
                  <Users size={15} /> Overview & Profile
                </button>
                <button
                  className={`profile-tab-btn ${activeTab === "projects" ? "active" : ""}`}
                  onClick={() => setActiveTab("projects")}
                >
                  <FolderGit2 size={15} /> Assigned Projects ({employeeDetails?.assigned_projects?.length || 0})
                </button>
                <button
                  className={`profile-tab-btn ${activeTab === "tasks" ? "active" : ""}`}
                  onClick={() => setActiveTab("tasks")}
                >
                  <ListTodo size={15} /> Tasks ({employeeDetails?.total_tasks || 0})
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
                  <p style={{ marginTop: "10px", color: "#6b7280" }}>Loading complete profile details...</p>
                </div>
              ) : employeeDetails ? (
                <div>
                  {/* Tab 1: Overview & Profile */}
                  {activeTab === "overview" && (
                    <div style={{ display: "grid", gap: "16px" }}>
                      <div className="detail-info-grid">
                        <div className="detail-item">
                          <span>Full Name</span>
                          <strong>{employeeDetails.full_name}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Email Address</span>
                          <strong>{employeeDetails.email}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Employee ID</span>
                          <strong>{employeeDetails.employee_id}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Department</span>
                          <strong>{employeeDetails.department || "Ingage"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Designation</span>
                          <strong>{employeeDetails.designation || "Employee"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Joining Date</span>
                          <strong>{employeeDetails.joining_date || "Not specified"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Phone Number</span>
                          <strong>{employeeDetails.mobile || "Not provided"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Work Location</span>
                          <strong>{employeeDetails.work_location || "Not specified"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Reporting Manager</span>
                          <strong>{employeeDetails.reporting_manager?.full_name || "None"}</strong>
                        </div>
                        <div className="detail-item">
                          <span>Account Status</span>
                          <span className={`status-pill ${employeeDetails.status}`}>{employeeDetails.status}</span>
                        </div>
                      </div>

                      {employeeDetails.skills && employeeDetails.skills.length > 0 && (
                        <div style={{ padding: "14px 18px", background: "#f9fafb", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
                          <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: "700", color: "#6b7280", display: "block", marginBottom: "8px" }}>
                            Skills & Expertise
                          </span>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                            {employeeDetails.skills.map((s, idx) => (
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
                      {employeeDetails.assigned_projects && employeeDetails.assigned_projects.length > 0 ? (
                        <div style={{ display: "grid", gap: "10px" }}>
                          {employeeDetails.assigned_projects.map((proj) => (
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
                          No projects currently assigned to this employee.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Tab 3: Tasks */}
                  {activeTab === "tasks" && (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", fontSize: "0.82rem", color: "#4b5563" }}>
                        <span>Total: <strong>{employeeDetails.total_tasks}</strong></span>
                        <span>Completed: <strong>{employeeDetails.completed_tasks}</strong></span>
                        <span>Completion Rate: <strong>{employeeDetails.task_completion_rate}%</strong></span>
                      </div>
                      {employeeDetails.tasks && employeeDetails.tasks.length > 0 ? (
                        <div style={{ display: "grid", gap: "10px" }}>
                          {employeeDetails.tasks.map((task) => (
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
                                <span>Project: {task.project_name || "Personal"}</span>
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
                          No tasks assigned to this employee.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Tab 4: Attendance History */}
                  {activeTab === "attendance" && (
                    <div>
                      {employeeDetails.attendance_history && employeeDetails.attendance_history.length > 0 ? (
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
                            {employeeDetails.attendance_history.map((att) => {
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
                          No recent attendance sessions found for this employee.
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
