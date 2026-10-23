import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
  ClipboardList,
} from "lucide-react";
import api from "../api.js";
import AccessibleModal from "../components/AccessibleModal.jsx";
import { useAuth } from "../context/useAuth.js";
import "./AdminTasks.css";

const priorities = ["Low", "Medium", "High", "Urgent"];
const taskStatuses = [
  "Assigned",
  "In Progress",
  "Submitted for Review",
  "Changes Requested",
  "Completed",
];

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${val}T12:00:00Z`));
  } catch {
    return val;
  }
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === "Completed") return false;
  const today = new Date().toISOString().split("T")[0];
  return dueDate < today;
}

// ----------------------------------------------------
// ASSIGN TASK MODAL WITH CRITICAL PROJECT MEMBER FILTERING
// ----------------------------------------------------
function AssignTaskModal({ onClose, onSuccess, projects, allAssignableUsers, userRole }) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    project_id: "",
    assignee_ids: [],
    assignment_type: "Individual",
    priority: "Medium",
    start_date: "",
    due_date: "",
  });

  const [projectMembers, setProjectMembers] = useState([]);
  const [hasSavedTeam, setHasSavedTeam] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let cancelled = false;

    if (!formData.project_id) {
      setProjectMembers([]);
      setHasSavedTeam(false);
      setFormData((prev) => ({
        ...prev,
        assignee_ids: [],
        assignment_type: "Individual",
      }));
      return;
    }

    if (formData.project_id === "standalone") {
      const assignable = allAssignableUsers || [];
      setProjectMembers(assignable);
      setHasSavedTeam(false);
      const validIds = new Set(assignable.map((u) => u.id));
      setFormData((prev) => {
        const next = prev.assignee_ids.filter((id) => validIds.has(id));
        return {
          ...prev,
          assignee_ids: next,
          assignment_type: next.length > 1 ? "Group" : "Individual",
        };
      });
      return;
    }

    async function loadMembers() {
      setMembersLoading(true);
      try {
        const res = await api.get(`/api/tasks/project-members/${formData.project_id}`);
        if (!cancelled) {
          const list = res.data || [];
          const isTeam = list.length > 0 && list.some((m) => m.is_project_team);
          setProjectMembers(list);
          setHasSavedTeam(isTeam);
          const validIds = new Set(list.map((u) => u.id));
          setFormData((prev) => {
            const next = prev.assignee_ids.filter((id) => validIds.has(id));
            return {
              ...prev,
              assignee_ids: next,
              assignment_type: next.length > 1 ? "Group" : "Individual",
            };
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load project members:", err);
          const fallback = allAssignableUsers || [];
          setProjectMembers(fallback);
          setHasSavedTeam(false);
        }
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    }

    loadMembers();

    return () => {
      cancelled = true;
    };
  }, [formData.project_id, allAssignableUsers]);

  function handleAssigneeToggle(userId) {
    setFormData((prev) => {
      const exists = prev.assignee_ids.includes(userId);
      const next = exists
        ? prev.assignee_ids.filter((id) => id !== userId)
        : [...prev.assignee_ids, userId];
      return {
        ...prev,
        assignee_ids: next,
        assignment_type: next.length > 1 ? "Group" : "Individual",
      };
    });
    if (fieldErrors.assignee_ids) {
      setFieldErrors((prev) => ({ ...prev, assignee_ids: null }));
    }
  }

  function validate() {
    const errors = {};
    if (!formData.title.trim()) {
      errors.title = "Task title is required.";
    }
    if (!formData.project_id) {
      errors.project_id = "Please select a project or standalone task.";
    }
    if (formData.assignee_ids.length === 0) {
      errors.assignee_ids = "At least one team member must be assigned.";
    }
    if (!formData.start_date) {
      errors.start_date = "Planned start date is required.";
    }
    if (!formData.due_date) {
      errors.due_date = "Planned end date is required.";
    }
    if (formData.start_date && formData.due_date && formData.due_date < formData.start_date) {
      errors.due_date = "Planned end date cannot be earlier than planned start date.";
    }
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        project_id: formData.project_id === "standalone" ? null : parseInt(formData.project_id, 10),
        assignee_ids: formData.assignee_ids,
        assignment_type: formData.assignment_type,
        priority: formData.priority,
        start_date: formData.start_date,
        due_date: formData.due_date,
      };

      await api.post("/api/tasks", payload);
      onSuccess("Task successfully assigned to team members.");
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          "Failed to assign task. Please ensure all assignees are authorized members."
      );
    } finally {
      setLoading(false);
    }
  }

  const isProjectChosen = Boolean(formData.project_id);
  const hasNoEligibleMembers = Boolean(
    isProjectChosen && !membersLoading && projectMembers.length === 0
  );

  return (
    <AccessibleModal title="Assign Task" onClose={onClose}>
      <form className="task-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="tasks-alert tasks-alert-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* Title */}
        <div className="task-field">
          <label htmlFor="task-title-input">
            Title <span className="required">*</span>
          </label>
          <input
            id="task-title-input"
            type="text"
            required
            autoFocus
            placeholder="e.g. Implement user dashboard charts"
            value={formData.title}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, title: e.target.value }));
              if (fieldErrors.title) setFieldErrors((p) => ({ ...p, title: null }));
            }}
          />
          {fieldErrors.title && (
            <span className="task-field-error">{fieldErrors.title}</span>
          )}
        </div>

        {/* Description */}
        <div className="task-field">
          <label htmlFor="task-desc-input">Description (Optional)</label>
          <textarea
            id="task-desc-input"
            rows={3}
            placeholder="Add task context, deliverables, and acceptance criteria..."
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
          />
        </div>

        {/* Project Selection */}
        <div className="task-field">
          <label htmlFor="task-project-select">
            Project <span className="required">*</span>
          </label>
          <select
            id="task-project-select"
            required
            value={formData.project_id}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, project_id: e.target.value }));
              if (fieldErrors.project_id) setFieldErrors((p) => ({ ...p, project_id: null }));
            }}
          >
            <option value="">-- Select a Project --</option>
            {userRole === "admin" && (
              <option value="standalone">Standalone Task (No Project)</option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.department ? `— ${p.department}` : ""} {p.status ? `(${p.status})` : ""}
              </option>
            ))}
          </select>
          {fieldErrors.project_id && (
            <span className="task-field-error">{fieldErrors.project_id}</span>
          )}
        </div>

        {/* Assign To Member Selector */}
        <div className="task-field">
          <label>
            Assign To <span className="required">*</span>
          </label>

          {!isProjectChosen ? (
            <p className="task-member-select-hint">
              Select a project or standalone task above to view authorized team members.
            </p>
          ) : membersLoading ? (
            <p className="task-member-select-hint">Loading eligible team members...</p>
          ) : (
            <>
              {hasSavedTeam ? (
                <div style={{
                  padding: "6px 12px",
                  marginBottom: "8px",
                  background: "rgba(101, 163, 13, 0.08)",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  color: "#3f6212",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}>
                  <Users size={14} />
                  <span>Project Team ({projectMembers.length} saved members). Select assignees for this task:</span>
                </div>
              ) : formData.project_id !== "standalone" ? (
                <div style={{
                  padding: "6px 12px",
                  marginBottom: "8px",
                  background: "#eff6ff",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  color: "#1d4ed8",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}>
                  <UserPlus size={14} />
                  <span>Initial Team Assignment: This project has no saved team yet. Selected users will be assigned to this task and persisted as the project's permanent team.</span>
                </div>
              ) : null}

              <div className="task-assignee-selector" style={{ maxHeight: "170px" }}>
                {projectMembers.length === 0 ? (
                  <p className="task-member-select-hint" style={{ padding: "14px", margin: 0, textAlign: "center", color: "#64748b" }}>
                    No team members are assigned to this project yet.
                  </p>
                ) : (
                  projectMembers.map((member) => {
                    const isChecked = formData.assignee_ids.includes(member.id);
                    return (
                      <label key={member.id} className="task-assignee-option">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleAssigneeToggle(member.id)}
                        />
                        <div className="task-assignee-option-info">
                          <strong>{member.full_name}</strong>
                          <small>
                            {member.role || "Member"}
                            {(member.company_unit || member.department) ? ` • ${member.company_unit || member.department}` : ""}
                            {member.staff_category ? ` (${member.staff_category})` : ""}
                          </small>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="task-member-select-hint">
                {formData.assignee_ids.length === 0
                  ? "Select one or more team members."
                  : `${formData.assignee_ids.length} member(s) selected (${formData.assignment_type} Assignment)`}
              </p>
            </>
          )}

          {fieldErrors.assignee_ids && (
            <span className="task-field-error">{fieldErrors.assignee_ids}</span>
          )}
        </div>

        {/* Dates Row */}
        <div className="task-form-row">
          <div className="task-field">
            <label htmlFor="task-start-date">
              Planned Start <span className="required">*</span>
            </label>
            <input
              id="task-start-date"
              type="date"
              required
              value={formData.start_date}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, start_date: e.target.value }));
                if (fieldErrors.start_date) setFieldErrors((p) => ({ ...p, start_date: null }));
              }}
            />
            {fieldErrors.start_date && (
              <span className="task-field-error">{fieldErrors.start_date}</span>
            )}
          </div>

          <div className="task-field">
            <label htmlFor="task-due-date">
              Planned End <span className="required">*</span>
            </label>
            <input
              id="task-due-date"
              type="date"
              required
              value={formData.due_date}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, due_date: e.target.value }));
                if (fieldErrors.due_date) setFieldErrors((p) => ({ ...p, due_date: null }));
              }}
            />
            {fieldErrors.due_date && (
              <span className="task-field-error">{fieldErrors.due_date}</span>
            )}
          </div>
        </div>

        {/* Priority */}
        <div className="task-field">
          <label htmlFor="task-priority-select">Priority</label>
          <select
            id="task-priority-select"
            value={formData.priority}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, priority: e.target.value }))
            }
          >
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="task-form-actions">
          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="taskflow-btn-primary"
            disabled={loading || hasNoEligibleMembers}
            id="submit-assign-task-btn"
          >
            {loading ? "Assigning..." : "Assign Task"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// EDIT TASK MODAL (UNIFIED WITH TEAM MEMBER ASSIGNMENT)
// ----------------------------------------------------
function EditTaskModal({
  task,
  onClose,
  onSuccess,
  projects,
  allAssignableUsers,
  userRole,
}) {
  const [formData, setFormData] = useState({
    title: task.title || "",
    description: task.description || "",
    project_id: task.project_id ? String(task.project_id) : "standalone",
    assignee_ids: task.assignees ? task.assignees.map((a) => a.id) : [],
    priority: task.priority || "Medium",
    status: task.status || "Assigned",
    start_date: task.start_date || "",
    due_date: task.due_date || "",
    estimated_hours: task.estimated_hours ?? "",
    progress: task.progress || 0,
  });

  const [projectMembers, setProjectMembers] = useState([]);
  const [hasSavedTeam, setHasSavedTeam] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    let cancelled = false;

    if (!formData.project_id) {
      setProjectMembers([]);
      setHasSavedTeam(false);
      return;
    }

    if (formData.project_id === "standalone") {
      setProjectMembers(allAssignableUsers || []);
      setHasSavedTeam(false);
      return;
    }

    async function loadMembers() {
      setMembersLoading(true);
      try {
        const res = await api.get(`/api/tasks/project-members/${formData.project_id}`);
        if (!cancelled) {
          const list = res.data || [];
          const isTeam = list.length > 0 && list.some((m) => m.is_project_team);
          setProjectMembers(list);
          setHasSavedTeam(isTeam);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load project members in Edit:", err);
          setProjectMembers(allAssignableUsers || []);
          setHasSavedTeam(false);
        }
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    }

    loadMembers();

    return () => {
      cancelled = true;
    };
  }, [formData.project_id, allAssignableUsers]);

  function handleAssigneeToggle(userId) {
    setFormData((prev) => {
      const exists = prev.assignee_ids.includes(userId);
      const next = exists
        ? prev.assignee_ids.filter((id) => id !== userId)
        : [...prev.assignee_ids, userId];
      return {
        ...prev,
        assignee_ids: next,
      };
    });
    if (fieldErrors.assignee_ids) {
      setFieldErrors((prev) => ({ ...prev, assignee_ids: null }));
    }
  }

  function validate() {
    const errors = {};
    if (!formData.title.trim()) {
      errors.title = "Task title is required.";
    }
    if (!formData.project_id) {
      errors.project_id = "Please select a project or standalone task.";
    }
    if (formData.assignee_ids.length === 0) {
      errors.assignee_ids = "At least one team member must be assigned.";
    }
    if (!formData.start_date) {
      errors.start_date = "Planned start date is required.";
    }
    if (!formData.due_date) {
      errors.due_date = "Planned end date is required.";
    }
    if (formData.start_date && formData.due_date && formData.due_date < formData.start_date) {
      errors.due_date = "Planned end date cannot be earlier than planned start date.";
    }
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        project_id: formData.project_id === "standalone" ? null : parseInt(formData.project_id, 10),
        assignee_ids: formData.assignee_ids,
        priority: formData.priority,
        status: formData.status,
        start_date: formData.start_date,
        due_date: formData.due_date,
        estimated_hours: formData.estimated_hours !== "" ? parseFloat(formData.estimated_hours) : null,
        progress: parseInt(formData.progress, 10),
      };

      await api.put(`/api/tasks/${task.id}`, payload);
      onSuccess(`Task #${task.id} updated successfully.`);
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          err.response?.data?.message ||
          "Failed to update task. Please verify that all assignees are authorized members."
      );
    } finally {
      setLoading(false);
    }
  }

  const isProjectChosen = Boolean(formData.project_id);
  const hasNoEligibleMembers = Boolean(
    isProjectChosen &&
      formData.project_id !== "standalone" &&
      !membersLoading &&
      projectMembers.length === 0
  );

  return (
    <AccessibleModal title={`Edit Task: ${task.title}`} onClose={onClose}>
      <form className="task-form" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="tasks-alert tasks-alert-error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {/* Title */}
        <div className="task-field">
          <label htmlFor="edit-task-title-input">
            Title <span className="required">*</span>
          </label>
          <input
            id="edit-task-title-input"
            type="text"
            required
            autoFocus
            placeholder="e.g. Implement user dashboard charts"
            value={formData.title}
            onChange={(e) => {
              setFormData((prev) => ({ ...prev, title: e.target.value }));
              if (fieldErrors.title) setFieldErrors((p) => ({ ...p, title: null }));
            }}
          />
          {fieldErrors.title && (
            <span className="task-field-error">{fieldErrors.title}</span>
          )}
        </div>

        {/* Description */}
        <div className="task-field">
          <label htmlFor="edit-task-desc-input">Description (Optional)</label>
          <textarea
            id="edit-task-desc-input"
            rows={3}
            placeholder="Add task context, deliverables, and acceptance criteria..."
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
          />
        </div>

        {/* Project Selection */}
        <div className="task-field">
          <label htmlFor="edit-task-project-select">
            Project <span className="required">*</span>
          </label>
          <select
            id="edit-task-project-select"
            required
            value={formData.project_id}
            onChange={(e) => {
              const newProj = e.target.value;
              setFormData((prev) => ({
                ...prev,
                project_id: newProj,
                assignee_ids: newProj === (task.project_id ? String(task.project_id) : "standalone")
                  ? (task.assignees ? task.assignees.map((a) => a.id) : [])
                  : [],
              }));
              if (fieldErrors.project_id) setFieldErrors((p) => ({ ...p, project_id: null }));
            }}
          >
            <option value="">-- Select a Project --</option>
            {userRole === "admin" && (
              <option value="standalone">Standalone Task (No Project)</option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.department ? `— ${p.department}` : ""} {p.status ? `(${p.status})` : ""}
              </option>
            ))}
          </select>
          {fieldErrors.project_id && (
            <span className="task-field-error">{fieldErrors.project_id}</span>
          )}
        </div>

        {/* Assign To Member Selector (Unified in same modal) */}
        <div className="task-field">
          <label>
            Assign To / Team Members <span className="required">*</span>
          </label>

          {!isProjectChosen ? (
            <p className="task-member-select-hint">
              Select a project or standalone task above to view authorized team members.
            </p>
          ) : membersLoading ? (
            <p className="task-member-select-hint">Loading eligible team members...</p>
          ) : (
            <>
              {hasSavedTeam && (
                <div style={{
                  padding: "6px 12px",
                  marginBottom: "8px",
                  background: "rgba(101, 163, 13, 0.08)",
                  borderRadius: "6px",
                  fontSize: "0.82rem",
                  color: "#3f6212",
                  fontWeight: "600",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}>
                  <Users size={14} />
                  <span>Project Team ({projectMembers.length} members). Saved project team remains unchanged when editing task assignees.</span>
                </div>
              )}
              <div className="task-assignee-selector" style={{ maxHeight: "170px" }}>
                {projectMembers.length === 0 ? (
                  <p className="task-member-select-hint" style={{ padding: "14px", margin: 0, textAlign: "center", color: "#64748b" }}>
                    No team members are assigned to this project yet.
                  </p>
                ) : (
                  projectMembers.map((member) => {
                    const isChecked = formData.assignee_ids.includes(member.id);
                    return (
                      <label key={member.id} className="task-assignee-option">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleAssigneeToggle(member.id)}
                        />
                        <div className="task-assignee-option-info">
                          <strong>{member.full_name}</strong>
                          <small>
                            {member.role || "Member"}
                            {(member.company_unit || member.department) ? ` • ${member.company_unit || member.department}` : ""}
                            {member.staff_category ? ` (${member.staff_category})` : ""}
                          </small>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              <p className="task-member-select-hint">
                {formData.assignee_ids.length === 0
                  ? "Select one or more team members."
                  : `${formData.assignee_ids.length} member(s) assigned (${formData.assignee_ids.length > 1 ? "Group" : "Individual"} Assignment)`}
              </p>
            </>
          )}

          {fieldErrors.assignee_ids && (
            <span className="task-field-error">{fieldErrors.assignee_ids}</span>
          )}
        </div>

        {/* Dates Row */}
        <div className="task-form-row">
          <div className="task-field">
            <label htmlFor="edit-task-start-date">
              Planned Start <span className="required">*</span>
            </label>
            <input
              id="edit-task-start-date"
              type="date"
              required
              value={formData.start_date}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, start_date: e.target.value }));
                if (fieldErrors.start_date) setFieldErrors((p) => ({ ...p, start_date: null }));
              }}
            />
            {fieldErrors.start_date && (
              <span className="task-field-error">{fieldErrors.start_date}</span>
            )}
          </div>

          <div className="task-field">
            <label htmlFor="edit-task-due-date">
              Planned End <span className="required">*</span>
            </label>
            <input
              id="edit-task-due-date"
              type="date"
              required
              value={formData.due_date}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, due_date: e.target.value }));
                if (fieldErrors.due_date) setFieldErrors((p) => ({ ...p, due_date: null }));
              }}
            />
            {fieldErrors.due_date && (
              <span className="task-field-error">{fieldErrors.due_date}</span>
            )}
          </div>
        </div>

        {/* Priority & Status Row */}
        <div className="task-form-row">
          <div className="task-field">
            <label htmlFor="edit-task-priority-select">Priority</label>
            <select
              id="edit-task-priority-select"
              value={formData.priority}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, priority: e.target.value }))
              }
            >
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="task-field">
            <label htmlFor="edit-task-status-select">Status</label>
            <select
              id="edit-task-status-select"
              value={formData.status}
              onChange={(e) => {
                const newStatus = e.target.value;
                setFormData((prev) => ({
                  ...prev,
                  status: newStatus,
                  progress: newStatus === "Completed" ? 100 : prev.progress,
                }));
              }}
            >
              {taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Estimated Hours & Progress Row */}
        <div className="task-form-row">
          <div className="task-field">
            <label htmlFor="edit-task-hours">Estimated Hours</label>
            <input
              id="edit-task-hours"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 12"
              value={formData.estimated_hours}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, estimated_hours: e.target.value }))
              }
            />
          </div>

          <div className="task-field">
            <label htmlFor="edit-task-progress">
              % Complete ({formData.progress}%)
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                id="edit-task-progress"
                type="range"
                min="0"
                max="100"
                step="5"
                value={formData.progress}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, progress: parseInt(e.target.value, 10) }))
                }
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: "0.85rem", fontWeight: 700, width: "42px", textAlign: "right" }}>
                {formData.progress}%
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="task-form-actions">
          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="taskflow-btn-primary"
            disabled={loading || hasNoEligibleMembers}
            id="submit-edit-task-btn"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// DELETE CONFIRMATION MODAL
// ----------------------------------------------------
function DeleteConfirmModal({ task, onClose, onConfirm, loading }) {
  return (
    <AccessibleModal title="Delete Task" onClose={onClose}>
      <div className="task-form" style={{ gap: "18px" }}>
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "8px",
              backgroundColor: "#fee2e2",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "#dc2626",
            }}
          >
            <AlertTriangle size={22} />
          </div>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: "1rem", color: "#111827", fontWeight: 700 }}>
              Confirm Task Deletion
            </h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#4b5563", lineHeight: 1.55 }}>
              Are you sure you want to delete task <strong>#{task.id} — {task.title}</strong>? This will permanently remove the task and all associated assignment and activity records. This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="task-form-actions" style={{ marginTop: "6px" }}>
          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="taskflow-btn-danger"
            onClick={onConfirm}
            disabled={loading}
            id="confirm-delete-task-btn"
          >
            {loading ? "Deleting..." : "Delete Task"}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// TASK DETAILS MODAL
// ----------------------------------------------------
function TaskDetailsModal({ task, onClose }) {
  const [detailedTask, setDetailedTask] = useState(task);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchFullDetails() {
      if (!task?.id) return;
      setLoading(true);
      try {
        const res = await api.get(`/api/tasks/${task.id}`);
        if (!cancelled) {
          setDetailedTask(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch fresh task details:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchFullDetails();
    return () => {
      cancelled = true;
    };
  }, [task?.id]);

  const t = detailedTask || task;

  return (
    <AccessibleModal title={`Task Details: ${t.title}`} onClose={onClose}>
      <div className="task-form" style={{ gap: "20px" }}>
        <dl className="task-details-facts">
          <div className="task-fact">
            <dt>Project</dt>
            <dd>{t.project ? t.project.name : "Standalone Task"}</dd>
          </div>
          <div className="task-fact">
            <dt>Company Unit</dt>
            <dd>{t.project?.department || "—"}</dd>
          </div>
          <div className="task-fact">
            <dt>Status</dt>
            <dd>
              <span
                className={`task-status-badge status-${(t.status || "assigned")
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
                style={{ fontSize: "0.72rem", padding: "2px 8px" }}
              >
                {t.status}
              </span>
            </dd>
          </div>
          <div className="task-fact">
            <dt>Priority</dt>
            <dd>
              <span
                className={`task-priority-badge priority-${(t.priority || "medium").toLowerCase()}`}
                style={{ fontSize: "0.72rem", padding: "2px 8px" }}
              >
                {t.priority || "Medium"}
              </span>
            </dd>
          </div>
          <div className="task-fact">
            <dt>Planned Start</dt>
            <dd>{formatDate(t.start_date)}</dd>
          </div>
          <div className="task-fact">
            <dt>Planned End</dt>
            <dd>{formatDate(t.due_date)}</dd>
          </div>
          <div className="task-fact">
            <dt>% Complete</dt>
            <dd>{t.progress || 0}%</dd>
          </div>
          <div className="task-fact">
            <dt>Assigned By</dt>
            <dd>{t.assigned_by?.full_name || "System"}</dd>
          </div>
        </dl>

        {t.description && (
          <div>
            <h3 className="task-section-title">Description</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#374151", lineHeight: 1.55 }}>
              {t.description}
            </p>
          </div>
        )}

        <div>
          <h3 className="task-section-title">Assigned Team Members</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px" }}>
            {(() => {
              const uniqueAssignees = [];
              const seenIds = new Set();
              for (const a of t.assignees || []) {
                if (a && a.id != null && !seenIds.has(a.id)) {
                  seenIds.add(a.id);
                  uniqueAssignees.push(a);
                }
              }
              return uniqueAssignees.length > 0 ? (
                uniqueAssignees.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "#f3f4f6",
                      padding: "5px 11px",
                      borderRadius: "6px",
                      fontSize: "0.82rem",
                      color: "#1f2937",
                    }}
                  >
                    <strong>{a.full_name}</strong>
                    <span style={{ color: "#6b7280" }}>
                      ({a.role || "Member"}
                      {a.department ? ` • ${a.department}` : ""}
                      {a.staff_category ? ` • ${a.staff_category}` : ""})
                    </span>
                  </div>
                ))
              ) : (
                <span style={{ color: "#9ca3af", fontSize: "0.82rem" }}>No assignees</span>
              );
            })()}
          </div>
        </div>

        {(t.review_comments || t.submission_notes) && (
          <div>
            <h3 className="task-section-title">Blockers & Notes</h3>
            {t.review_comments && (
              <div className="task-blocker-note" style={{ display: "block", marginBottom: "8px", padding: "10px 14px" }}>
                <strong>Supervisor Feedback / Blockers:</strong>
                <p style={{ margin: "3px 0 0" }}>{t.review_comments}</p>
              </div>
            )}
            {t.submission_notes && (
              <div className="task-submission-note" style={{ display: "block", padding: "10px 14px" }}>
                <strong>Assignee Submission Notes:</strong>
                <p style={{ margin: "3px 0 0" }}>{t.submission_notes}</p>
              </div>
            )}
          </div>
        )}

        {t.activities?.length > 0 && (
          <div>
            <h3 className="task-section-title">Activity History</h3>
            <div className="task-timeline">
              {t.activities.map((act) => (
                <div key={act.id} className="task-timeline-item">
                  <div className="task-timeline-header">
                    <span className="task-timeline-action">{act.action}</span>
                    <span>by {act.user?.full_name || "System"}</span>
                    <span>• {formatDate(act.created_at)}</span>
                  </div>
                  {act.comment && (
                    <div className="task-timeline-comment">{act.comment}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="task-form-actions">
          <button type="button" className="taskflow-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// MAIN TEAM TASKS PAGE COMPONENT
// ----------------------------------------------------
export default function AssignTasksPage() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";
  const isAdmin = user?.role === "admin";

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Filters: Project/Company Unit, Employee, Status, Search
  const [filters, setFilters] = useState({
    q: "",
    company_unit: "",
    project_id: "",
    user_id: "",
    status: "",
  });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [retry, setRetry] = useState(0);

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editModalTask, setEditModalTask] = useState(null);
  const [deleteModalTask, setDeleteModalTask] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [detailsModalTask, setDetailsModalTask] = useState(null);

  // Load Projects and Staff from database
  useEffect(() => {
    let cancelled = false;
    async function fetchMetadata() {
      try {
        const [projRes, usersRes] = await Promise.all([
          api.get("/api/projects", { params: { page_size: 100 } }),
          api.get("/api/tasks/assignable-users"),
        ]);
        if (!cancelled) {
          setProjects(projRes.data.items || []);
          setAssignableUsers(usersRes.data || []);
        }
      } catch (err) {
        console.error("Failed to load metadata:", err);
      }
    }
    fetchMetadata();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  // Load Tasks based on filters
  useEffect(() => {
    let cancelled = false;
    async function loadTasks() {
      setLoading(true);
      setError("");
      try {
        const params = {
          page,
          page_size: pageSize,
          my_tasks: false,
        };

        if (filters.q.trim()) params.q = filters.q.trim();
        if (filters.company_unit) params.department = filters.company_unit;

        if (filters.project_id === "standalone") {
          params.standalone = true;
        } else if (filters.project_id) {
          params.project_id = parseInt(filters.project_id, 10);
        }

        if (filters.user_id) params.user_id = parseInt(filters.user_id, 10);
        if (filters.status) params.status = filters.status;

        const res = await api.get("/api/tasks", { params });
        if (!cancelled) {
          setTasks(res.data.items || []);
          setTotal(res.data.total || 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Unable to load team tasks.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadTasks();
    return () => {
      cancelled = true;
    };
  }, [filters, page, retry]);

  function handleFilterChange(key, value) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // If company unit changed and selected project doesn't belong to it, reset project_id
      if (key === "company_unit" && value && prev.project_id && prev.project_id !== "standalone") {
        const proj = projects.find((p) => String(p.id) === String(prev.project_id));
        if (proj && proj.department !== value) {
          next.project_id = "";
        }
      }
      return next;
    });
    setPage(1);
  }

  function handleResetFilters() {
    setFilters({
      q: "",
      company_unit: "",
      project_id: "",
      user_id: "",
      status: "",
    });
    setPage(1);
  }

  function handleRefresh() {
    setRefreshing(true);
    setRetry((v) => v + 1);
  }

  async function confirmDelete() {
    if (!deleteModalTask) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/api/tasks/${deleteModalTask.id}`);
      setFeedback(`Task #${deleteModalTask.id} deleted successfully.`);
      setDeleteModalTask(null);
      setRetry((v) => v + 1);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete task.");
      setDeleteModalTask(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  // Derive unique company units from actual database projects
  const companyUnits = Array.from(
    new Set(projects.map((p) => p.department).filter(Boolean))
  );

  // Filter projects shown in project filter dropdown by company unit if selected
  const filteredProjects = filters.company_unit
    ? projects.filter((p) => p.department === filters.company_unit)
    : projects;

  const totalPages = Math.ceil(total / pageSize) || 1;
  const hasActiveFilters = Boolean(
    filters.q || filters.company_unit || filters.project_id || filters.user_id || filters.status
  );

  return (
    <div className="tasks-page">
      {/* PAGE HEADER */}
      <header className="tasks-heading">
        <div>
          <p className="tasks-eyebrow">Team Tasks</p>
          <h1>Team Tasks</h1>
          <p>Live view of your team's task board</p>
        </div>
        <div className="tasks-header-actions">
          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            id="refresh-team-tasks-btn"
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            <span>Refresh</span>
          </button>
          {canManage && (
            <button
              type="button"
              className="taskflow-btn-primary"
              onClick={() => setShowAssignModal(true)}
              id="open-assign-task-btn"
            >
              <Plus size={16} />
              <span>Assign Task</span>
            </button>
          )}
        </div>
      </header>

      {/* Feedback Alerts */}
      {feedback && (
        <div className="tasks-alert tasks-alert-success">
          <span>{feedback}</span>
          <button
            type="button"
            className="tasks-alert-close"
            onClick={() => setFeedback("")}
            aria-label="Dismiss feedback"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div className="tasks-alert tasks-alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={handleRefresh}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* MAIN TABLE PANEL */}
      <section className="tasks-panel">
        {/* FILTERS BAR */}
        <div
          className="tasks-filter-bar"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "flex-end",
            width: "100%",
            maxWidth: "100%",
          }}
        >
          {/* Search */}
          <div className="tasks-filter-field" style={{ flex: "1 1 180px", minWidth: "160px" }}>
            <label htmlFor="team-tasks-search">Search</label>
            <div className="tasks-search-wrap">
              <Search size={15} />
              <input
                id="team-tasks-search"
                type="text"
                placeholder="Search title, ID..."
                value={filters.q}
                onChange={(e) => handleFilterChange("q", e.target.value)}
              />
            </div>
          </div>

          {/* Company Unit */}
          <div className="tasks-filter-field" style={{ flex: "1 1 150px", minWidth: "140px" }}>
            <label htmlFor="filter-company-unit">Company Unit</label>
            <select
              id="filter-company-unit"
              value={filters.company_unit}
              onChange={(e) => handleFilterChange("company_unit", e.target.value)}
            >
              <option value="">All Company Units</option>
              {companyUnits.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Project */}
          <div className="tasks-filter-field" style={{ flex: "1 1 180px", minWidth: "160px" }}>
            <label htmlFor="filter-project">Project</label>
            <select
              id="filter-project"
              value={filters.project_id}
              onChange={(e) => handleFilterChange("project_id", e.target.value)}
            >
              <option value="">All Projects</option>
              <option value="standalone">Standalone Tasks (No Project)</option>
              {filteredProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.department ? `(${p.department})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Employee */}
          <div className="tasks-filter-field" style={{ flex: "1 1 160px", minWidth: "150px" }}>
            <label htmlFor="filter-employee">Employee</label>
            <select
              id="filter-employee"
              value={filters.user_id}
              onChange={(e) => handleFilterChange("user_id", e.target.value)}
            >
              <option value="">All Employees</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="tasks-filter-field" style={{ flex: "1 1 140px", minWidth: "130px" }}>
            <label htmlFor="filter-status">Status</label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => handleFilterChange("status", e.target.value)}
            >
              <option value="">All Statuses</option>
              {taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="taskflow-btn-secondary"
              onClick={handleResetFilters}
              style={{ height: "38px", flexShrink: 0 }}
              title="Reset all filters"
            >
              <X size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* TABLE CONTENT */}
        <div className="tasks-table-wrapper tasks-table-wrap">
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "60px 20px", gap: "10px", color: "#6b7280" }}>
              <RefreshCw size={20} className="spin" />
              <span style={{ fontSize: "0.9rem" }}>Loading team tasks...</span>
            </div>
          ) : tasks.length === 0 ? (
            <div className="tasks-empty-state">
              <div className="tasks-empty-icon">
                <ClipboardList size={26} color="#65a30d" />
              </div>
              <strong>No team tasks found</strong>
              <p>
                {hasActiveFilters
                  ? "No tasks match your selected filters. Try adjusting or resetting the filters."
                  : "No tasks have been assigned to your team yet. Click 'Assign Task' to create one."}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  className="taskflow-btn-secondary"
                  onClick={handleResetFilters}
                >
                  Clear Filters
                </button>
              ) : canManage ? (
                <button
                  type="button"
                  className="taskflow-btn-primary"
                  onClick={() => setShowAssignModal(true)}
                >
                  <Plus size={15} />
                  <span>Assign First Task</span>
                </button>
              ) : null}
            </div>
          ) : (
            <table className="tasks-table" aria-label="Team Tasks Table">
              <thead>
                <tr>
                  <th style={{ minWidth: "170px" }}>Title</th>
                  <th style={{ minWidth: "120px" }}>Project</th>
                  <th style={{ minWidth: "130px" }}>Assigned Members</th>
                  <th style={{ minWidth: "140px", whiteSpace: "nowrap" }}>Planned Dates</th>
                  <th style={{ minWidth: "100px", whiteSpace: "nowrap" }}>Status</th>
                  <th style={{ minWidth: "110px", whiteSpace: "nowrap" }}>% Complete</th>
                  <th style={{ minWidth: "110px" }}>Blockers / Notes</th>
                  <th style={{ textAlign: "right", minWidth: "135px", paddingRight: "18px", whiteSpace: "nowrap" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const overdue = isOverdue(task.due_date, task.status);

                  return (
                    <tr key={task.id}>
                      {/* Title & Description */}
                      <td>
                        <div className="task-title-cell">
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <button
                              type="button"
                              className="task-title-btn"
                              onClick={() => setDetailsModalTask(task)}
                              title="View task details"
                            >
                              {task.title}
                            </button>
                            <span
                              className={`task-priority-badge priority-${(task.priority || "medium").toLowerCase()}`}
                              style={{ fontSize: "0.66rem", padding: "1px 6px" }}
                            >
                              {task.priority || "Medium"}
                            </span>
                          </div>
                          {task.description && (
                            <small title={task.description}>
                              {task.description}
                            </small>
                          )}
                        </div>
                      </td>

                      {/* Project / Standalone */}
                      <td>
                        {task.project ? (
                          <div className="task-project-cell">
                            <strong>{task.project.name}</strong>
                            {task.project.department && (
                              <span className="task-unit-tag">
                                {task.project.department}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="task-standalone-badge">
                            Standalone Task
                          </span>
                        )}
                      </td>

                      {/* Employee / Assigned Members */}
                      <td>
                        <div className="task-assignees-stack">
                          {(() => {
                            const uniqueAssignees = [];
                            const seenIds = new Set();
                            for (const a of task.assignees || []) {
                              if (a && a.id != null && !seenIds.has(a.id)) {
                                seenIds.add(a.id);
                                uniqueAssignees.push(a);
                              }
                            }
                            return uniqueAssignees.length > 0 ? (
                              <div style={{ display: "grid", gap: "3px" }}>
                                {uniqueAssignees.map((assignee) => (
                                  <div
                                    key={assignee.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                      fontSize: "0.78rem",
                                    }}
                                  >
                                    <div
                                      className="task-user-avatar"
                                      style={{
                                        width: "22px",
                                        height: "22px",
                                        fontSize: "0.68rem",
                                        fontWeight: 700,
                                      }}
                                    >
                                      {assignee.full_name?.charAt(0) || "U"}
                                    </div>
                                    <div style={{ lineHeight: 1.2 }}>
                                      <strong style={{ color: "#111827" }}>
                                        {assignee.full_name}
                                      </strong>
                                      <span style={{ color: "#6b7280", marginLeft: "4px", fontSize: "0.7rem" }}>
                                        ({assignee.role || "Member"})
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: "#9ca3af", fontSize: "0.76rem" }}>
                                Unassigned
                              </span>
                            );
                          })()}
                        </div>
                      </td>

                      {/* Planned Dates */}
                      <td>
                        <div className="task-date-cell">
                          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <Calendar size={13} color="#6b7280" />
                            <span>
                              {formatDate(task.start_date)} → {formatDate(task.due_date)}
                            </span>
                          </div>
                          {overdue && (
                            <div className="task-date-overdue" style={{ marginTop: "2px" }}>
                              <AlertTriangle size={12} />
                              <span>Overdue</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`task-status-badge status-${(task.status || "assigned")
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {task.status}
                        </span>
                      </td>

                      {/* % Complete */}
                      <td>
                        <div className="task-progress-cell">
                          <div className="task-progress-track">
                            <div
                              className={`task-progress-fill ${task.progress === 100 ? "is-complete" : ""}`}
                              style={{ width: `${task.progress || 0}%` }}
                            />
                          </div>
                          <span className="task-progress-label">
                            {task.progress || 0}% Complete
                          </span>
                        </div>
                      </td>

                      {/* Blockers / Notes */}
                      <td>
                        <div className="task-blockers-cell">
                          {task.review_comments ? (
                            <div className="task-blocker-note" title={task.review_comments}>
                              <AlertCircle size={12} style={{ flexShrink: 0, marginTop: "2px" }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                {task.review_comments}
                              </span>
                            </div>
                          ) : task.submission_notes ? (
                            <div className="task-submission-note" title={task.submission_notes}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                {task.submission_notes}
                              </span>
                            </div>
                          ) : (
                            <span className="task-no-blockers">—</span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: "right", minWidth: "90px", paddingRight: "18px", whiteSpace: "nowrap" }}>
                        <div className="task-action-buttons" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                          {/* Edit Button */}
                          {canManage && (
                            <button
                              type="button"
                              className="task-action-btn btn-edit"
                              title="Edit Task"
                              onClick={() => setEditModalTask(task)}
                            >
                              <Pencil size={15} />
                            </button>
                          )}

                          {/* Delete Button */}
                          {canManage && (
                            <button
                              type="button"
                              className="task-action-btn btn-delete"
                              title="Delete Task"
                              onClick={() => setDeleteModalTask(task)}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="tasks-pagination">
            <span>
              Showing {Math.min((page - 1) * pageSize + 1, total)} to{" "}
              {Math.min(page * pageSize, total)} of {total} tasks
            </span>
            <div className="tasks-pagination-nav">
              <button
                type="button"
                className="tasks-page-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                .map((pNum) => (
                  <button
                    key={pNum}
                    type="button"
                    className={`tasks-page-btn ${pNum === page ? "is-active" : ""}`}
                    onClick={() => setPage(pNum)}
                  >
                    {pNum}
                  </button>
                ))}
              <button
                type="button"
                className="tasks-page-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ASSIGN TASK MODAL */}
      {showAssignModal && (
        <AssignTaskModal
          onClose={() => setShowAssignModal(false)}
          onSuccess={(msg) => {
            setFeedback(msg);
            setRetry((v) => v + 1);
          }}
          projects={projects}
          allAssignableUsers={assignableUsers}
          userRole={user?.role}
        />
      )}

      {/* EDIT TASK MODAL */}
      {editModalTask && (
        <EditTaskModal
          task={editModalTask}
          onClose={() => setEditModalTask(null)}
          onSuccess={(msg) => {
            setFeedback(msg);
            setRetry((v) => v + 1);
          }}
          projects={projects}
          allAssignableUsers={assignableUsers}
          userRole={user?.role}
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteModalTask && (
        <DeleteConfirmModal
          task={deleteModalTask}
          onClose={() => setDeleteModalTask(null)}
          onConfirm={confirmDelete}
          loading={deleteLoading}
        />
      )}

      {/* DETAILS MODAL */}
      {detailsModalTask && (
        <TaskDetailsModal
          task={detailsModalTask}
          onClose={() => setDetailsModalTask(null)}
        />
      )}
    </div>
  );
}
