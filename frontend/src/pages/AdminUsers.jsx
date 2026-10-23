import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, Edit2, Eye, EyeOff, RefreshCw, RotateCw, Send, ShieldAlert, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api.js";
import AccessibleModal from "../components/AccessibleModal.jsx";
import StaffProfileModal from "../components/StaffProfileModal.jsx";
import { useAuth } from "../context/useAuth.js";
import "./AdminUsers.css";
import "./ProjectDrilldown.css";

const pageSize = 25;
const roles = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "team_lead", label: "Team Lead" },
  { value: "employee", label: "Employee" },
  { value: "intern", label: "Intern" },
  { value: "user", label: "Legacy user" },
];
const invitationRoles = [
  { value: "employee", label: "Employee" },
  { value: "intern", label: "Intern" },
  { value: "team_lead", label: "Team Lead" },
  { value: "manager", label: "Manager" },
];
const accountStatuses = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "invitation_pending", label: "Pending Activation" },
];

function getErrorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

function formatTimestamp(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function displayRole(person) {
  if (person.role === "team_lead") return "Team Lead";
  if (person.role === "user" && person.staff_category) {
    return person.staff_category;
  }
  return roles.find((role) => role.value === person.role)?.label || person.role;
}

function accountStatusLabel(value) {
  if (value === "invitation_pending") return "Pending activation";
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Not provided";
}

function AddUserModal({ onClose, onSave, busy, error, isAdmin }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [department, setDepartment] = useState("Ingage");
  const [employeeId, setEmployeeId] = useState("");
  const [setupMethod, setSetupMethod] = useState("setup_link"); // 'setup_link' or 'temp_password'
  const [tempPassword, setTempPassword] = useState("");
  const [validationError, setValidationError] = useState("");

  const allowedRoles = isAdmin
    ? invitationRoles
    : invitationRoles.filter((item) => item.value !== "manager");

  function handleSubmit(event) {
    event.preventDefault();
    setValidationError("");

    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedDept = department.trim();
    const trimmedId = employeeId.trim();

    if (!trimmedName) {
      setValidationError("Full Name is required.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      setValidationError("Please provide a valid email address.");
      return;
    }

    const payload = {
      full_name: trimmedName,
      email: trimmedEmail,
      role,
      department: trimmedDept || "Ingage",
      employee_id: trimmedId || null,
    };

    if (setupMethod === "temp_password") {
      if (!tempPassword || tempPassword.trim().length < 8) {
        setValidationError("Temporary password must be at least 8 characters long.");
        return;
      }
      payload.temporary_password = tempPassword.trim();
    }

    onSave(payload);
  }

  return (
    <AccessibleModal title="Add New User" onClose={onClose} className="invite-user-modal">
      <form className="invite-user-form" onSubmit={handleSubmit} noValidate>
        <p className="invite-modal-intro" style={{ marginBottom: "1rem" }}>
          Create a new user account with role permissions and organization details. A secure password setup link will be generated for the user.
        </p>

        <label style={{ display: "grid", gap: "4px", marginBottom: "0.85rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>
            Full Name <span style={{ color: "#dc2626" }}>*</span>
          </span>
          <input
            type="text"
            required
            maxLength={150}
            placeholder="e.g. Alex Johnson"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
          />
        </label>

        <label style={{ display: "grid", gap: "4px", marginBottom: "0.85rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>
            Email Address <span style={{ color: "#dc2626" }}>*</span>
          </span>
          <input
            type="email"
            required
            maxLength={255}
            placeholder="e.g. alex.j@ingage.biz"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "0.85rem" }}>
          <label style={{ display: "grid", gap: "4px" }}>
            <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>
              Role <span style={{ color: "#dc2626" }}>*</span>
            </span>
            <select
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
            >
              {allowedRoles.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "4px" }}>
            <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>Department</span>
            <input
              type="text"
              maxLength={120}
              placeholder="e.g. Ingage"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: "4px", marginBottom: "0.85rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>
            {role === "intern" ? "Intern ID" : "Employee ID"} <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>(Optional - auto-generated if left empty)</span>
          </span>
          <input
            type="text"
            maxLength={80}
            placeholder={role === "intern" ? "e.g. INT-0042" : "e.g. EMP-0042"}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
          />
        </label>

        <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px 14px", background: "#f9fafb", marginBottom: "1rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.84rem", display: "block", marginBottom: "6px", color: "#111827" }}>
            Account Setup Method
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.84rem", cursor: "pointer", marginBottom: "6px" }}>
            <input
              type="radio"
              name="setupMethod"
              value="setup_link"
              checked={setupMethod === "setup_link"}
              onChange={() => setSetupMethod("setup_link")}
            />
            <span><strong>Generate secure setup link</strong> (Single-use, time-limited, sent by email)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.84rem", cursor: "pointer" }}>
            <input
              type="radio"
              name="setupMethod"
              value="temp_password"
              checked={setupMethod === "temp_password"}
              onChange={() => setSetupMethod("temp_password")}
            />
            <span>Set temporary password directly</span>
          </label>

          {setupMethod === "temp_password" && (
            <div style={{ marginTop: "10px" }}>
              <input
                type="text"
                placeholder="Enter at least 8 characters"
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#fff" }}
              />
              <span style={{ fontSize: "0.74rem", color: "#6b7280", marginTop: "3px", display: "block" }}>
                User must be instructed to change this password on first login.
              </span>
            </div>
          )}
        </div>

        {(validationError || error) && (
          <p className="feedback-error" role="alert" style={{ marginBottom: "1rem" }}>
            {validationError || error}
          </p>
        )}

        <div className="invite-modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={busy} style={{ background: "#65a30d", color: "#fff", borderColor: "#65a30d" }}>
            {busy ? "Creating User…" : "Create User"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

function UpdateProfileModal({ user, onClose, onSave, busy, error }) {
  const [fullName, setFullName] = useState(user.full_name || "");
  const [department, setDepartment] = useState(user.department || "Ingage");
  const [staffId, setStaffId] = useState(user.staff_id || "");
  const [valError, setValError] = useState("");

  function submit(event) {
    event.preventDefault();
    const cleanName = fullName.trim();
    if (!cleanName) {
      setValError("Full name is required.");
      return;
    }
    onSave(user.id, {
      full_name: cleanName,
      department: department.trim() || "Ingage",
      staff_id: staffId.trim() || null,
    });
  }

  return (
    <AccessibleModal title="Update User Profile" onClose={onClose} className="invite-user-modal">
      <form className="invite-user-form" onSubmit={submit}>
        <p className="invite-modal-intro" style={{ marginBottom: "1rem" }}>
          Update name, department, or staff ID for <strong>{user.email}</strong>.
        </p>
        <label style={{ display: "grid", gap: "4px", marginBottom: "0.85rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>Full Name *</span>
          <input
            type="text"
            required
            maxLength={150}
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ display: "grid", gap: "4px", marginBottom: "0.85rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>Department</span>
          <input
            type="text"
            maxLength={120}
            placeholder="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
          />
        </label>
        <label style={{ display: "grid", gap: "4px", marginBottom: "0.85rem" }}>
          <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>Staff / Employee ID</span>
          <input
            type="text"
            maxLength={80}
            placeholder="Staff ID"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db" }}
          />
        </label>
        {(valError || error) && <p className="feedback-error" role="alert">{valError || error}</p>}
        <div className="invite-modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "1rem" }}>
          <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={busy} style={{ background: "#65a30d", color: "#fff", borderColor: "#65a30d" }}>
            {busy ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

function ChangeRoleModal({ user, onClose, onSave, busy, error }) {
  const [role, setRole] = useState(
    user.role === "admin" ? "manager" : (user.role || "employee")
  );

  function submit(event) {
    event.preventDefault();
    onSave(user.id, role);
  }

  return (
    <AccessibleModal title="Change Staff Role" onClose={onClose} className="invite-user-modal">
      <form className="invite-user-form" onSubmit={submit}>
        <p className="invite-modal-intro">
          Change the assigned staff role for <strong>{user.full_name || user.email}</strong>.
        </p>
        <label>
          Staff member
          <input
            type="text"
            readOnly
            disabled
            value={`${user.full_name || "Profile incomplete"} (${user.email})`}
          />
        </label>
        <label>
          Staff Role
          <select required value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="employee">Employee</option>
            <option value="intern">Intern</option>
            <option value="team_lead">Team Lead</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        {error && <p className="feedback-error" role="alert">{error}</p>}
        <div className="invite-modal-actions">
          <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit" disabled={busy} style={{ background: "#65a30d", color: "#fff", borderColor: "#65a30d" }}>
            {busy ? "Updating…" : "Update Role"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    q: "",
    role: "",
    status: "",
  });
  const [loadedKey, setLoadedKey] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [retry, setRetry] = useState(0);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [profileId, setProfileId] = useState(null);
  const [roleModalUser, setRoleModalUser] = useState(null);
  const [roleModalBusy, setRoleModalBusy] = useState(false);
  const [roleModalError, setRoleModalError] = useState("");
  const [editProfileUser, setEditProfileUser] = useState(null);
  const [editProfileBusy, setEditProfileBusy] = useState(false);
  const [editProfileError, setEditProfileError] = useState("");
  const [createdUserModalData, setCreatedUserModalData] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const requestKey = JSON.stringify([filters, page, retry]);

  useEffect(() => {
    let cancelled = false;
    async function loadUsers() {
      const params = { page, page_size: pageSize };
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params[key] = value;
      });
      try {
        const response = await api.get("/api/users", { params });
        if (cancelled) return;
        setUsers(response.data.items);
        setTotal(response.data.total);
        setLoadedKey(requestKey);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError({
            key: requestKey,
            message: getErrorMessage(error, "Unable to load users."),
          });
        }
      }
    }
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [filters, page, requestKey]);

  const loading = loadedKey !== requestKey && loadError?.key !== requestKey;
  const visibleLoadError = loadError?.key === requestKey ? loadError.message : "";

  function updateFilter(name, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function handleCreateUser(payload) {
    setInviteBusy(true);
    setInviteError("");
    setActionError("");
    setFeedback("");
    try {
      const response = await api.post("/api/admin/invitations", payload);
      setInviteOpen(false);
      setRetry((value) => value + 1);

      if (response.data.setup_link) {
        setCreatedUserModalData(response.data);
      } else {
        setFeedback(
          response.data.message ||
            `User account for ${payload.full_name} (${payload.email}) successfully created.`
        );
      }
    } catch (error) {
      setInviteError(
        getErrorMessage(
          error,
          "Unable to create user. Please verify user details and unique email."
        )
      );
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleSaveAdminProfile(userId, profileData) {
    setEditProfileBusy(true);
    setEditProfileError("");
    setActionError("");
    setFeedback("");
    try {
      await api.patch(`/api/users/${userId}/admin-profile`, profileData);
      setEditProfileUser(null);
      setFeedback(`Successfully updated profile for ${profileData.full_name}.`);
      setRetry((value) => value + 1);
    } catch (error) {
      setEditProfileError(getErrorMessage(error, "Unable to update profile."));
    } finally {
      setEditProfileBusy(false);
    }
  }

  async function resendInvitation(person) {
    if (!window.confirm(`Resend invitation with setup link to ${person.full_name || person.email}?`)) {
      return;
    }
    setUpdatingUserId(person.id);
    setActionError("");
    setFeedback("");
    try {
      const response = await api.post(`/api/admin/invitations/by-email/${encodeURIComponent(person.email)}/resend`);
      if (response.data.setup_link && !response.data.email_sent) {
        setCreatedUserModalData(response.data);
      } else {
        setFeedback(`Fresh invitation email successfully sent to ${person.email}.`);
      }
      setRetry((value) => value + 1);
    } catch (error) {
      setActionError(getErrorMessage(error, "Unable to resend invitation email."));
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function updateStatus(person) {
    const nextStatus = person.status === "active" ? "inactive" : "active";
    const action = nextStatus === "active" ? "activate" : "deactivate";
    if (!window.confirm(`Are you sure you want to ${action} ${person.full_name || person.email}?`)) {
      return;
    }
    setUpdatingUserId(person.id);
    setActionError("");
    setFeedback("");
    try {
      await api.patch(`/api/users/${person.id}/status`, { status: nextStatus });
      setFeedback(`${person.email}'s account is now ${nextStatus}.`);
      setRetry((value) => value + 1);
    } catch (error) {
      setActionError(getErrorMessage(error, "Unable to update this account."));
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function changeUserRole(userId, newRole) {
    setRoleModalBusy(true);
    setRoleModalError("");
    setActionError("");
    setFeedback("");
    try {
      await api.patch(`/api/users/${userId}/role`, { role: newRole });
      const targetUser = users.find((u) => u.id === userId);
      setFeedback(
        `Successfully changed ${targetUser?.full_name || targetUser?.email || "user"}'s role to ${newRole.charAt(0).toUpperCase() + newRole.slice(1)}.`
      );
      setRoleModalUser(null);
      setRetry((value) => value + 1);
    } catch (error) {
      setRoleModalError(getErrorMessage(error, "Unable to update role for this user."));
    } finally {
      setRoleModalBusy(false);
    }
  }

  return (
    <main className="admin-users-page">
      <header className="admin-users-header users-page-header">
        <div>
          <Link className="admin-back-link" to="/admin">
            <ArrowLeft size={15} aria-hidden="true" /> Back to admin dashboard
          </Link>
          <p className="admin-eyebrow">Administration</p>
          <h1>User Management</h1>
          <p className="admin-subtitle">Manage workspace access and track invite-only registrations.</p>
        </div>
        <button className="primary-button add-new-user-button" type="button" onClick={() => { setInviteError(""); setInviteOpen(true); }}>
          <UserPlus size={17} aria-hidden="true" /> Add New User
        </button>
      </header>

      {feedback && <p className="feedback-success user-page-feedback" role="status">{feedback}</p>}
      {actionError && <p className="feedback-error user-page-feedback" role="alert">{actionError}</p>}

      {/* All Users Section */}
      <section className="admin-panel users-panel" aria-labelledby="all-users-heading">
        <div className="panel-heading users-heading users-filter-heading">
          <div>
            <h2 id="all-users-heading">All Registered Users</h2>
            <p>{total} {total === 1 ? "account" : "accounts"}</p>
          </div>
          <div className="users-filter-controls">
            <label className="search-field">
              <span>Search name or email</span>
              <input
                type="search"
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
                placeholder="Search users"
              />
            </label>
            <label className="user-filter-select">
              <span>Role</span>
              <select value={filters.role} onChange={(event) => updateFilter("role", event.target.value)}>
                <option value="">All roles</option>
                {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
            </label>
            <label className="user-filter-select">
              <span>Account status</span>
              <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
                <option value="">All statuses</option>
                {accountStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {loading && <p className="table-message" role="status">Loading users…</p>}
        {!loading && visibleLoadError && (
          <div className="table-message error-state" role="alert">
            <p>{visibleLoadError}</p>
            <button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}
        {!loading && !visibleLoadError && users.length === 0 && (
          <p className="table-message">
            {total === 0 ? "No users match these filters." : "No users are available on this page."}
          </p>
        )}
        {!loading && !visibleLoadError && users.length > 0 && (
          <div className="users-table-wrap">
            <table className="users-table invitation-users-table">
              <thead>
                <tr>
                  <th scope="col">Name / email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Department</th>
                  <th scope="col">Account status</th>
                  <th scope="col">Registration Date (IST)</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((person) => {
                  const showStatusAction = person.can_manage_status
                    && (person.status === "active" || person.status === "inactive");
                  return (
                    <tr key={person.id}>
                      <td data-label="Name / email">
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                          <strong>{person.full_name || "Profile incomplete"}</strong>
                          {person.staff_id && (
                            <span style={{ fontSize: "0.72rem", background: "#f1f5f9", padding: "0.1rem 0.35rem", borderRadius: "4px", color: "#475569", fontWeight: 600 }}>
                              {person.staff_id}
                            </span>
                          )}
                        </div>
                        <span>{person.email}</span>
                      </td>
                      <td data-label="Role" className="role-label">{displayRole(person)}</td>
                      <td data-label="Department">{person.department || "Ingage"}</td>
                      <td data-label="Account status">
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-start" }}>
                          <span className={`status-badge status-${person.status}`}>
                            {accountStatusLabel(person.status)}
                          </span>
                          {(!person.full_name || person.profile_status === "incomplete") && (
                            <span style={{ fontSize: "0.7rem", background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a", padding: "0.1rem 0.4rem", borderRadius: "4px", fontWeight: 600 }}>
                              Profile Incomplete
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Registration Date (IST)">{formatTimestamp(person.registration_completed_at)}</td>
                      <td data-label="Actions" className="user-action-cell">
                        <div className="user-row-actions">
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => setProfileId(person.id)}
                            aria-label={`View ${person.full_name || person.email}`}
                          >
                            <Eye size={15} aria-hidden="true" /> View
                          </button>
                          {currentUser?.role === "admin" && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                setEditProfileError("");
                                setEditProfileUser(person);
                              }}
                              title="Update staff name or organization details"
                            >
                              <Edit2 size={13} aria-hidden="true" /> Edit
                            </button>
                          )}
                          {showStatusAction && (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={updatingUserId === person.id || (person.id === currentUser?.id && person.status === "active")}
                              onClick={() => updateStatus(person)}
                            >
                              {person.status === "active" ? "Deactivate" : "Activate"}
                            </button>
                          )}
                          {currentUser?.role === "admin" && person.id !== currentUser?.id && person.role !== "admin" && (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                setRoleModalError("");
                                setRoleModalUser(person);
                              }}
                            >
                              Change Role
                            </button>
                          )}
                          {currentUser?.role === "admin" && (person.profile_status === "incomplete" || person.must_change_password || person.status === "invitation_pending" || person.can_resend_invitation) && (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={updatingUserId === person.id}
                              onClick={() => resendInvitation(person)}
                              title={`Resend invitation credentials to ${person.email}`}
                            >
                              Resend Invite
                            </button>
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
        {!loading && !visibleLoadError && total > pageSize && (
          <nav className="admin-users-pagination" aria-label="User pages">
            <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
            <div>
              <button type="button" className="secondary-button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
              <span>Page {page} of {Math.ceil(total / pageSize)}</span>
              <button type="button" className="secondary-button" disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </nav>
        )}
      </section>

      {inviteOpen && (
        <AddUserModal
          onClose={() => setInviteOpen(false)}
          onSave={handleCreateUser}
          busy={inviteBusy}
          error={inviteError}
          isAdmin={currentUser?.role === "admin"}
        />
      )}
      {profileId !== null && (
        <StaffProfileModal userId={profileId} onClose={() => setProfileId(null)} />
      )}
      {editProfileUser && (
        <UpdateProfileModal
          user={editProfileUser}
          onClose={() => setEditProfileUser(null)}
          onSave={handleSaveAdminProfile}
          busy={editProfileBusy}
          error={editProfileError}
        />
      )}
      {roleModalUser && (
        <ChangeRoleModal
          user={roleModalUser}
          onClose={() => setRoleModalUser(null)}
          onSave={changeUserRole}
          busy={roleModalBusy}
          error={roleModalError}
        />
      )}
      {createdUserModalData && (
        <AccessibleModal
          title="User Account Created"
          onClose={() => {
            setCreatedUserModalData(null);
            setCopiedLink(false);
          }}
          className="invite-user-modal"
        >
          <div style={{ padding: "4px 0" }}>
            <p style={{ margin: "0 0 12px", color: "#111827", fontSize: "0.9rem", lineHeight: 1.5 }}>
              Account for <strong>{createdUserModalData.full_name || createdUserModalData.email}</strong> (
              {createdUserModalData.staff_id || createdUserModalData.role}) has been saved in the database.
            </p>

            {createdUserModalData.email_sent ? (
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "8px", padding: "10px 14px", color: "#065f46", fontSize: "0.85rem", marginBottom: "14px" }}>
                ✓ An invitation email with password setup instructions was sent to <strong>{createdUserModalData.email}</strong>.
              </div>
            ) : (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", color: "#92400e", fontSize: "0.85rem", marginBottom: "14px" }}>
                ℹ Direct email delivery was skipped or unavailable. You can copy the secure setup link below and share it directly with the user.
              </div>
            )}

            {createdUserModalData.setup_link && (
              <div style={{ marginBottom: "16px" }}>
                <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#374151", display: "block", marginBottom: "6px" }}>
                  Secure Setup Link (Single-use, time-limited):
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    readOnly
                    value={createdUserModalData.setup_link}
                    style={{ flex: 1, padding: "8px 10px", fontSize: "0.82rem", borderRadius: "6px", border: "1px solid #d1d5db", background: "#f3f4f6" }}
                  />
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      navigator.clipboard.writeText(createdUserModalData.setup_link);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 3000);
                    }}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#65a30d", borderColor: "#65a30d", whiteSpace: "nowrap" }}
                  >
                    {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                    {copiedLink ? "Copied!" : "Copy Link"}
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setCreatedUserModalData(null);
                  setCopiedLink(false);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </AccessibleModal>
      )}
    </main>
  );
}
