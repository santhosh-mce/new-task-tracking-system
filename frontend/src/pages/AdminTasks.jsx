import { useEffect, useState, useId } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  FileCheck2,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Sliders,
  Send,
  Trash2,
  UserCheck,
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
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
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
// CREATE TASK MODAL
// ----------------------------------------------------
function CreateTaskModal({ onClose, onSuccess, projects, assignableUsers }) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    project_id: projects[0]?.id || "",
    assignee_ids: [],
    assignment_type: "Individual",
    priority: "Medium",
    start_date: "",
    due_date: "",
    estimated_hours: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filteredUsers = assignableUsers;

  function toggleAssignee(userId) {
    if (formData.assignment_type === "Individual") {
      setFormData((prev) => ({
        ...prev,
        assignee_ids: prev.assignee_ids.includes(userId) ? [] : [userId],
      }));
    } else {
      setFormData((prev) => {
        const exists = prev.assignee_ids.includes(userId);
        const next = exists
          ? prev.assignee_ids.filter((id) => id !== userId)
          : [...prev.assignee_ids, userId];
        return { ...prev, assignee_ids: next };
      });
    }
  }

  function handleTypeChange(type) {
    setFormData((prev) => ({
      ...prev,
      assignment_type: type,
      assignee_ids:
        type === "Individual" && prev.assignee_ids.length > 1
          ? [prev.assignee_ids[0]]
          : prev.assignee_ids,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!formData.title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (!formData.project_id) {
      setError("Please select a project.");
      return;
    }
    if (!formData.due_date) {
      setError("Due date is required.");
      return;
    }
    if (
      formData.start_date &&
      formData.due_date &&
      formData.due_date < formData.start_date
    ) {
      setError("Due date cannot be earlier than start date.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        project_id: parseInt(formData.project_id, 10),
        assignee_ids: formData.assignee_ids,
        assignment_type: formData.assignment_type,
        priority: formData.priority,
        start_date: formData.start_date || null,
        due_date: formData.due_date,
        estimated_hours: formData.estimated_hours
          ? parseFloat(formData.estimated_hours)
          : null,
      };

      await api.post("/api/tasks", payload);
      onSuccess("Task created successfully!");
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(", ")
          : "Failed to create task. Please verify required fields."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessibleModal title="+ Create New Task" onClose={onClose}>
      <form className="task-form" onSubmit={handleSubmit}>
        {error && <div className="tasks-alert tasks-alert-error">{error}</div>}

        <div className="task-field">
          <label>
            Task Title <span className="required">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Design Landing Page Wireframes"
            value={formData.title}
            onChange={(e) =>
              setFormData({ ...formData, title: e.target.value })
            }
            required
            autoFocus
          />
        </div>

        <div className="task-field">
          <label>Description</label>
          <textarea
            placeholder="Provide context, acceptance criteria, or deliverables..."
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
          />
        </div>

        <div className="task-form-row">
          <div className="task-field">
            <label>
              Project <span className="required">*</span>
            </label>
            <select
              value={formData.project_id}
              onChange={(e) =>
                setFormData({ ...formData, project_id: e.target.value })
              }
              required
            >
              <option value="">Select Project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.department})
                </option>
              ))}
            </select>
          </div>

          <div className="task-field">
            <label>Priority</label>
            <select
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: e.target.value })
              }
            >
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="task-form-row">
          <div className="task-field">
            <label>Assignment Type</label>
            <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="assignment_type"
                  checked={formData.assignment_type === "Individual"}
                  onChange={() => handleTypeChange("Individual")}
                />
                <span>Individual</span>
              </label>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="assignment_type"
                  checked={formData.assignment_type === "Group"}
                  onChange={() => handleTypeChange("Group")}
                />
                <span>Group (Multiple)</span>
              </label>
            </div>
          </div>

          <div className="task-field">
            <label>Estimated Hours</label>
            <input
              type="number"
              step="0.5"
              min="0"
              placeholder="e.g. 12"
              value={formData.estimated_hours}
              onChange={(e) =>
                setFormData({ ...formData, estimated_hours: e.target.value })
              }
            />
          </div>
        </div>

        <div className="task-field">
          <label>
            Assign Staff Member(s){" "}
            {formData.assignment_type === "Group"
              ? "(Select one or more)"
              : "(Select one)"}
          </label>
          <div className="task-assignee-selector">
            {filteredUsers.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  padding: 8,
                  fontSize: "0.78rem",
                  color: "#6b7280",
                }}
              >
                No active staff members found.
              </p>
            ) : (
              filteredUsers.map((u) => {
                const checked = formData.assignee_ids.includes(u.id);
                return (
                  <div
                    key={u.id}
                    className="task-assignee-option"
                    onClick={() => toggleAssignee(u.id)}
                  >
                    <input
                      type={
                        formData.assignment_type === "Individual"
                          ? "radio"
                          : "checkbox"
                      }
                      checked={checked}
                      onChange={() => {}}
                    />
                    <div className="task-assignee-option-info">
                      <strong>{u.full_name || u.email}</strong>
                      <small>
                        {u.role} · {u.staff_category || "Staff"}
                        {u.department ? ` (${u.department})` : ""}
                      </small>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="task-form-row">
          <div className="task-field">
            <label>Start Date</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) =>
                setFormData({ ...formData, start_date: e.target.value })
              }
            />
          </div>

          <div className="task-field">
            <label>
              Due Date <span className="required">*</span>
            </label>
            <input
              type="date"
              value={formData.due_date}
              onChange={(e) =>
                setFormData({ ...formData, due_date: e.target.value })
              }
              required
            />
          </div>
        </div>

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
            disabled={loading}
          >
            {loading ? "Creating Task..." : "Create Task"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// EDIT TASK MODAL
// ----------------------------------------------------
function EditTaskModal({ task, onClose, onSuccess, projects }) {
  const [formData, setFormData] = useState({
    title: task.title || "",
    description: task.description || "",
    project_id: task.project_id || "",
    priority: task.priority || "Medium",
    status: task.status || "Assigned",
    start_date: task.start_date || "",
    due_date: task.due_date || "",
    estimated_hours:
      task.estimated_hours !== null && task.estimated_hours !== undefined
        ? task.estimated_hours
        : "",
    progress: task.progress || 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!formData.title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (
      formData.start_date &&
      formData.due_date &&
      formData.due_date < formData.start_date
    ) {
      setError("Due date cannot be earlier than start date.");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        project_id: parseInt(formData.project_id, 10),
        priority: formData.priority,
        status: formData.status,
        start_date: formData.start_date || null,
        due_date: formData.due_date || null,
        estimated_hours: formData.estimated_hours
          ? parseFloat(formData.estimated_hours)
          : null,
        progress: parseInt(formData.progress, 10),
      };

      await api.put(`/api/tasks/${task.id}`, payload);
      onSuccess("Task updated successfully!");
      onClose();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Failed to update task. Please check your inputs."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessibleModal title={`Edit Task #${task.id}`} onClose={onClose}>
      <form className="task-form" onSubmit={handleSubmit}>
        {error && <div className="tasks-alert tasks-alert-error">{error}</div>}

        <div className="task-field">
          <label>
            Task Title <span className="required">*</span>
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) =>
              setFormData({ ...formData, title: e.target.value })
            }
            required
          />
        </div>

        <div className="task-field">
          <label>Description</label>
          <textarea
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
          />
        </div>

        <div className="task-form-row">
          <div className="task-field">
            <label>Project</label>
            <select
              value={formData.project_id}
              onChange={(e) =>
                setFormData({ ...formData, project_id: e.target.value })
              }
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="task-field">
            <label>Priority</label>
            <select
              value={formData.priority}
              onChange={(e) =>
                setFormData({ ...formData, priority: e.target.value })
              }
            >
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="task-form-row">
          <div className="task-field">
            <label>Status</label>
            <select
              value={formData.status}
              onChange={(e) =>
                setFormData({ ...formData, status: e.target.value })
              }
            >
              {taskStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="task-field">
            <label>Progress ({formData.progress}%)</label>
            <input
              type="range"
              min="0"
              max="100"
              value={formData.progress}
              onChange={(e) =>
                setFormData({ ...formData, progress: e.target.value })
              }
            />
          </div>
        </div>

        <div className="task-form-row">
          <div className="task-field">
            <label>Start Date</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) =>
                setFormData({ ...formData, start_date: e.target.value })
              }
            />
          </div>

          <div className="task-field">
            <label>Due Date</label>
            <input
              type="date"
              value={formData.due_date}
              onChange={(e) =>
                setFormData({ ...formData, due_date: e.target.value })
              }
            />
          </div>
        </div>

        <div className="task-field">
          <label>Estimated Hours</label>
          <input
            type="number"
            step="0.5"
            min="0"
            value={formData.estimated_hours}
            onChange={(e) =>
              setFormData({ ...formData, estimated_hours: e.target.value })
            }
          />
        </div>

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
            disabled={loading}
          >
            {loading ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// ASSIGN TASK MODAL
// ----------------------------------------------------
function AssignTaskModal({ task, onClose, onSuccess, assignableUsers }) {
  const [selectedIds, setSelectedIds] = useState(
    task.assignees ? task.assignees.map((a) => a.id) : []
  );
  const [type, setType] = useState(task.assignment_type || "Individual");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggle(userId) {
    if (type === "Individual") {
      setSelectedIds([userId]);
    } else {
      setSelectedIds((prev) =>
        prev.includes(userId)
          ? prev.filter((id) => id !== userId)
          : [...prev, userId]
      );
    }
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (selectedIds.length === 0) {
      setError("Please select at least one team member.");
      return;
    }
    setLoading(true);
    try {
      await api.post(`/api/tasks/${task.id}/assign`, {
        assignee_ids: selectedIds,
        assignment_type: selectedIds.length > 1 ? "Group" : type,
      });
      onSuccess("Task assignments updated successfully!");
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.detail || "Failed to update task assignments."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessibleModal title={`Assign Task: ${task.title}`} onClose={onClose}>
      <form className="task-form" onSubmit={handleAssign}>
        {error && <div className="tasks-alert tasks-alert-error">{error}</div>}

        <div className="task-field">
          <label>Assignment Mode</label>
          <div style={{ display: "flex", gap: 16 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="assign_type"
                checked={type === "Individual"}
                onChange={() => {
                  setType("Individual");
                  if (selectedIds.length > 1) setSelectedIds([selectedIds[0]]);
                }}
              />
              <span>Individual</span>
            </label>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="assign_type"
                checked={type === "Group"}
                onChange={() => setType("Group")}
              />
              <span>Group (Multiple Members)</span>
            </label>
          </div>
        </div>

        <div className="task-field">
          <label>Select Team Member(s)</label>
          <div className="task-assignee-selector" style={{ maxHeight: 220 }}>
            {assignableUsers.map((u) => {
              const isChecked = selectedIds.includes(u.id);
              return (
                <div
                  key={u.id}
                  className="task-assignee-option"
                  onClick={() => toggle(u.id)}
                >
                  <input
                    type={type === "Individual" ? "radio" : "checkbox"}
                    checked={isChecked}
                    onChange={() => {}}
                  />
                  <div className="task-assignee-option-info">
                    <strong>{u.full_name || u.email}</strong>
                    <small>
                      {u.role} · {u.staff_category || "Staff"}
                      {u.department ? ` (${u.department})` : ""}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
            disabled={loading}
          >
            {loading ? "Assigning..." : "Save Assignments"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// UPDATE PROGRESS MODAL
// ----------------------------------------------------
function UpdateProgressModal({ task, onClose, onSuccess }) {
  const [progress, setProgress] = useState(task.progress || 0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpdate(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch(`/api/tasks/${task.id}/progress`, {
        progress: parseInt(progress, 10),
        comment: comment.trim() || null,
      });
      onSuccess("Task progress updated!");
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update progress.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessibleModal title={`Update Progress: ${task.title}`} onClose={onClose}>
      <form className="task-form" onSubmit={handleUpdate}>
        {error && <div className="tasks-alert tasks-alert-error">{error}</div>}

        <div className="task-field">
          <label>Current Progress: {progress}%</label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={progress}
            onChange={(e) => setProgress(e.target.value)}
          />
        </div>

        <div className="task-field">
          <label>Progress Notes / Updates</label>
          <textarea
            placeholder="Briefly state what was completed or milestone reached..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

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
            disabled={loading}
          >
            {loading ? "Saving..." : "Update Progress"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// SUBMIT FOR REVIEW MODAL
// ----------------------------------------------------
function SubmitReviewModal({ task, onClose, onSuccess }) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/api/tasks/${task.id}/submit-review`, {
        submission_notes: notes.trim() || null,
      });
      onSuccess("Task submitted for review!");
      onClose();
    } catch (err) {
      setError(
        err.response?.data?.detail || "Failed to submit task for review."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessibleModal
      title={`Submit for Review: ${task.title}`}
      onClose={onClose}
    >
      <form className="task-form" onSubmit={handleSubmit}>
        {error && <div className="tasks-alert tasks-alert-error">{error}</div>}

        <p style={{ margin: "0 0 10px", fontSize: "0.83rem", color: "#4b5563" }}>
          Once submitted, the task status will move to{" "}
          <strong>Submitted for Review</strong> so managers and administrators
          can evaluate deliverables and provide approval or feedback.
        </p>

        <div className="task-field">
          <label>Submission Notes</label>
          <textarea
            placeholder="Summarize the completed work, provide links, PRs, or relevant verification notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
          />
        </div>

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
            disabled={loading}
          >
            {loading ? "Submitting..." : "Submit for Review"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// REVIEW TASK MODAL (APPROVE / REQUEST CHANGES)
// ----------------------------------------------------
function ReviewTaskModal({ task, onClose, onSuccess }) {
  const [action, setAction] = useState("approve");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleReview(e) {
    e.preventDefault();
    if (action === "request_changes" && !comment.trim()) {
      setError("Please provide feedback comments explaining the requested changes.");
      return;
    }

    setLoading(true);
    try {
      await api.post(`/api/tasks/${task.id}/review`, {
        action,
        comment: comment.trim() || null,
      });
      onSuccess(
        action === "approve"
          ? "Task approved and marked as Completed!"
          : "Changes requested. Status moved back to Changes Requested."
      );
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to submit review.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AccessibleModal title={`Review Task: ${task.title}`} onClose={onClose}>
      <form className="task-form" onSubmit={handleReview}>
        {error && <div className="tasks-alert tasks-alert-error">{error}</div>}

        {task.submission_notes && (
          <div
            style={{
              padding: 12,
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: "0.82rem",
            }}
          >
            <strong style={{ display: "block", marginBottom: 4, color: "#111827" }}>
              Staff Submission Notes:
            </strong>
            <p style={{ margin: 0, color: "#4b5563" }}>{task.submission_notes}</p>
          </div>
        )}

        <div className="task-field">
          <label>Review Decision</label>
          <div style={{ display: "flex", gap: 16 }}>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                fontWeight: action === "approve" ? "700" : "500",
                color: action === "approve" ? "#16a34a" : "inherit",
              }}
            >
              <input
                type="radio"
                name="review_action"
                checked={action === "approve"}
                onChange={() => setAction("approve")}
              />
              <span>Approve (Mark Completed)</span>
            </label>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                fontWeight: action === "request_changes" ? "700" : "500",
                color: action === "request_changes" ? "#dc2626" : "inherit",
              }}
            >
              <input
                type="radio"
                name="review_action"
                checked={action === "request_changes"}
                onChange={() => setAction("request_changes")}
              />
              <span>Request Changes</span>
            </label>
          </div>
        </div>

        <div className="task-field">
          <label>
            Review Remarks & Comments{" "}
            {action === "request_changes" && <span className="required">*</span>}
          </label>
          <textarea
            placeholder={
              action === "approve"
                ? "Optional approval praise or notes..."
                : "Describe precisely what changes or fixes are required..."
            }
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            required={action === "request_changes"}
          />
        </div>

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
            style={{
              backgroundColor: action === "approve" ? "#16a34a" : "#dc2626",
              borderColor: action === "approve" ? "#16a34a" : "#dc2626",
            }}
            disabled={loading}
          >
            {loading
              ? "Submitting..."
              : action === "approve"
              ? "Approve & Complete"
              : "Request Changes"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// TASK DETAILS MODAL (VIEW)
// ----------------------------------------------------
function TaskDetailsModal({
  task,
  onClose,
  onEdit,
  onAssign,
  onProgress,
  onSubmitReview,
  onReview,
  canManage,
}) {
  const overdue = isOverdue(task.due_date, task.status);

  return (
    <AccessibleModal title={`Task Details: ${task.title}`} onClose={onClose}>
      <div className="task-details-view">
        <dl className="task-details-facts">
          <div className="task-fact">
            <dt>Task ID</dt>
            <dd>#{task.id}</dd>
          </div>
          <div className="task-fact">
            <dt>Project</dt>
            <dd>
              {task.project?.name}{" "}
              <small style={{ color: "#6b7280" }}>
                ({task.project?.department})
              </small>
            </dd>
          </div>
          <div className="task-fact">
            <dt>Status</dt>
            <dd>
              <span
                className={`task-status-badge status-${task.status
                  .toLowerCase()
                  .replace(/\s+/g, "-")}`}
              >
                {task.status}
              </span>
            </dd>
          </div>
          <div className="task-fact">
            <dt>Priority</dt>
            <dd>
              <span
                className={`task-priority-badge priority-${task.priority.toLowerCase()}`}
              >
                {task.priority}
              </span>
            </dd>
          </div>
          <div className="task-fact">
            <dt>Start Date</dt>
            <dd>{formatDate(task.start_date)}</dd>
          </div>
          <div className="task-fact">
            <dt>Due Date</dt>
            <dd className={overdue ? "task-date-overdue" : ""}>
              {formatDate(task.due_date)} {overdue && "(Overdue)"}
            </dd>
          </div>
          <div className="task-fact">
            <dt>Estimated Hours</dt>
            <dd>{task.estimated_hours ? `${task.estimated_hours} hrs` : "—"}</dd>
          </div>
          <div className="task-fact">
            <dt>Assigned By</dt>
            <dd>{task.assigned_by?.full_name || "System / Unassigned"}</dd>
          </div>
        </dl>

        {task.description && (
          <div>
            <h3 className="task-section-title">Description</h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.84rem",
                lineHeight: 1.6,
                color: "#374151",
              }}
            >
              {task.description}
            </p>
          </div>
        )}

        <div>
          <h3 className="task-section-title">
            <Users size={16} /> Assigned Members ({task.assignees?.length || 0})
            <span className="task-assignment-badge">
              {task.assignment_type || "Individual"}
            </span>
          </h3>
          {task.assignees?.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {task.assignees.map((member) => (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#f9fafb",
                    borderRadius: 6,
                    border: "1px solid #f3f4f6",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="task-user-avatar">
                      {member.full_name?.trim().charAt(0).toUpperCase() || "U"}
                    </span>
                    <div>
                      <strong style={{ fontSize: "0.82rem", display: "block" }}>
                        {member.full_name}
                      </strong>
                      <small style={{ color: "#6b7280", fontSize: "0.72rem" }}>
                        {member.email}
                      </small>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: "#4b5563",
                    }}
                  >
                    {member.staff_category || member.role}
                    {member.department ? ` · ${member.department}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#9ca3af" }}>
              No members assigned yet.
            </p>
          )}
        </div>

        {task.submission_notes && (
          <div
            style={{
              padding: 12,
              background: "#fefce8",
              border: "1px solid #fef08a",
              borderRadius: 8,
              fontSize: "0.82rem",
            }}
          >
            <strong style={{ color: "#854d0e", display: "block", marginBottom: 3 }}>
              Latest Submission Notes
            </strong>
            <p style={{ margin: 0, color: "#713f12" }}>{task.submission_notes}</p>
          </div>
        )}

        {task.review_comments && (
          <div
            style={{
              padding: 12,
              background:
                task.status === "Completed" ? "#f0fdf4" : "#fff1f2",
              border:
                task.status === "Completed"
                  ? "1px solid #bbf7d0"
                  : "1px solid #fecdd3",
              borderRadius: 8,
              fontSize: "0.82rem",
            }}
          >
            <strong
              style={{
                color: task.status === "Completed" ? "#166534" : "#9f1239",
                display: "block",
                marginBottom: 3,
              }}
            >
              Reviewer Feedback
            </strong>
            <p
              style={{
                margin: 0,
                color: task.status === "Completed" ? "#14532d" : "#881337",
              }}
            >
              {task.review_comments}
            </p>
          </div>
        )}

        {task.activities?.length > 0 && (
          <div>
            <h3 className="task-section-title">
              <Clock size={16} /> Activity & Workflow Timeline
            </h3>
            <div className="task-timeline">
              {task.activities.map((act) => (
                <div key={act.id} className="task-timeline-item">
                  <div className="task-timeline-header">
                    <span className="task-timeline-action">
                      {act.action.replace(/_/g, " ")}
                    </span>
                    <span>·</span>
                    <span>{act.user?.full_name || "System"}</span>
                    <span>·</span>
                    <small>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(act.created_at))}
                    </small>
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
          {canManage && (
            <>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => {
                  onClose();
                  onAssign(task);
                }}
              >
                <UserPlus size={15} /> Reassign
              </button>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => {
                  onClose();
                  onEdit(task);
                }}
              >
                <Edit2 size={15} /> Edit Task
              </button>
            </>
          )}

          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={() => {
              onClose();
              onProgress(task);
            }}
          >
            <Sliders size={15} /> Update Progress
          </button>

          {task.status !== "Completed" && (
            <button
              type="button"
              className="taskflow-btn-secondary"
              onClick={() => {
                onClose();
                onSubmitReview(task);
              }}
            >
              <Send size={15} /> Submit for Review
            </button>
          )}

          {canManage && task.status === "Submitted for Review" && (
            <button
              type="button"
              className="taskflow-btn-primary"
              onClick={() => {
                onClose();
                onReview(task);
              }}
            >
              <CheckCircle2 size={15} /> Review & Approve
            </button>
          )}
        </div>
      </div>
    </AccessibleModal>
  );
}

// ----------------------------------------------------
// MAIN ADMIN TASKS PAGE COMPONENT
// ----------------------------------------------------
export default function AdminTasks() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";

  // Data states
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [assignableUsers, setAssignableUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Filter states
  const [filters, setFilters] = useState({
    q: "",
    project_id: "",
    user_id: "",
    role: "",
    priority: "",
    status: "",
    due_date: "",
    overdue: false,
    my_tasks: false,
  });

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [retry, setRetry] = useState(0);

  // Modal active states
  const [activeModal, setActiveModal] = useState(null); // 'create', 'edit', 'assign', 'progress', 'submit_review', 'review', 'details'
  const [selectedTask, setSelectedTask] = useState(null);

  // Load summary counts
  useEffect(() => {
    let cancelled = false;
    async function fetchSummary() {
      try {
        const res = await api.get("/api/tasks/summary", {
          params: { my_tasks: filters.my_tasks },
        });
        if (!cancelled) setSummary(res.data);
      } catch (err) {
        console.error("Failed to load task summary:", err);
      }
    }
    fetchSummary();
    return () => {
      cancelled = true;
    };
  }, [retry, filters.my_tasks]);

  // Load projects & assignable users
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

  // Load task list
  useEffect(() => {
    let cancelled = false;
    async function loadTasks() {
      setLoading(true);
      setError("");
      try {
        const params = { page, page_size: pageSize };
        if (filters.q.trim()) params.q = filters.q.trim();
        if (filters.project_id) params.project_id = filters.project_id;
        if (filters.user_id) params.user_id = filters.user_id;
        if (filters.role) params.role = filters.role;
        if (filters.priority) params.priority = filters.priority;
        if (filters.status) params.status = filters.status;
        if (filters.due_date) params.due_date = filters.due_date;
        if (filters.overdue) params.overdue = true;
        if (filters.my_tasks) params.my_tasks = true;

        const res = await api.get("/api/tasks", { params });
        if (!cancelled) {
          setTasks(res.data.items || []);
          setTotal(res.data.total || 0);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Unable to load tasks at this time."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTasks();
    return () => {
      cancelled = true;
    };
  }, [filters, page, retry]);

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters({
      q: "",
      project_id: "",
      user_id: "",
      role: "",
      priority: "",
      status: "",
      due_date: "",
      overdue: false,
      my_tasks: false,
    });
    setPage(1);
  }

  // Summary card clicks
  function handleCardClick(type) {
    if (type === "all") {
      handleFilterChange("status", "");
      handleFilterChange("overdue", false);
    } else if (type === "in_progress") {
      handleFilterChange("status", "In Progress");
      handleFilterChange("overdue", false);
    } else if (type === "pending_review") {
      handleFilterChange("status", "Submitted for Review");
      handleFilterChange("overdue", false);
    } else if (type === "completed") {
      handleFilterChange("status", "Completed");
      handleFilterChange("overdue", false);
    } else if (type === "overdue") {
      handleFilterChange("overdue", true);
      handleFilterChange("status", "");
    }
  }

  async function handleDelete(taskId) {
    if (!window.confirm(`Are you sure you want to delete task #${taskId}?`)) {
      return;
    }
    try {
      await api.delete(`/api/tasks/${taskId}`);
      setFeedback("Task deleted successfully.");
      setRetry((v) => v + 1);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete task.");
    }
  }

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className="tasks-page">
      {/* Intro & Action Buttons */}
      <header className="tasks-heading">
        <div>
          <p className="tasks-eyebrow">Work coordination</p>
          <h1>Tasks & Assignments</h1>
          <p>
            Assign team deliverables, track individual and group progress,
            review submissions, and maintain project accountability.
          </p>
        </div>
        <div className="tasks-header-actions">
          <button
            type="button"
            className={`taskflow-btn-secondary ${
              filters.my_tasks ? "is-active" : ""
            }`}
            onClick={() => handleFilterChange("my_tasks", !filters.my_tasks)}
            title="Toggle between All Tasks and tasks assigned to you"
          >
            <UserCheck size={16} />
            <span>{filters.my_tasks ? "Showing: My Tasks" : "My Tasks"}</span>
          </button>

          {canManage && (
            <>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => {
                  if (tasks.length > 0) {
                    setSelectedTask(tasks[0]);
                    setActiveModal("assign");
                  } else {
                    setActiveModal("create");
                  }
                }}
              >
                <UserPlus size={16} />
                <span>Assign Task</span>
              </button>

              <button
                type="button"
                className="taskflow-btn-primary"
                onClick={() => setActiveModal("create")}
              >
                <Plus size={16} />
                <span>+ Create Task</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Alerts */}
      {feedback && (
        <div className="tasks-alert tasks-alert-success">
          <span>{feedback}</span>
          <button
            type="button"
            className="tasks-alert-close"
            onClick={() => setFeedback("")}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div className="tasks-alert tasks-alert-error">
          <span>{error}</span>
          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={() => setRetry((v) => v + 1)}
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <section className="tasks-stat-grid" aria-label="Task Status Summary">
        <button
          type="button"
          className={`tasks-stat-card ${
            !filters.status && !filters.overdue ? "is-active" : ""
          }`}
          onClick={() => handleCardClick("all")}
        >
          <div className="tasks-stat-top">
            <span className="tasks-stat-label">Total Tasks</span>
            <span className="tasks-stat-icon">
              <ClipboardList size={18} />
            </span>
          </div>
          <strong className="tasks-stat-value">
            {summary ? summary.total_tasks : "—"}
          </strong>
          <span className="tasks-stat-sub">All active tasks in workspace</span>
        </button>

        <button
          type="button"
          className={`tasks-stat-card stat-in-progress ${
            filters.status === "In Progress" ? "is-active" : ""
          }`}
          onClick={() => handleCardClick("in_progress")}
        >
          <div className="tasks-stat-top">
            <span className="tasks-stat-label">In Progress</span>
            <span className="tasks-stat-icon">
              <Clock size={18} />
            </span>
          </div>
          <strong className="tasks-stat-value">
            {summary ? summary.in_progress : "—"}
          </strong>
          <span className="tasks-stat-sub">Currently underway</span>
        </button>

        <button
          type="button"
          className={`tasks-stat-card stat-pending ${
            filters.status === "Submitted for Review" ? "is-active" : ""
          }`}
          onClick={() => handleCardClick("pending_review")}
        >
          <div className="tasks-stat-top">
            <span className="tasks-stat-label">Pending Review</span>
            <span className="tasks-stat-icon">
              <AlertCircle size={18} />
            </span>
          </div>
          <strong className="tasks-stat-value">
            {summary ? summary.pending_review : "—"}
          </strong>
          <span className="tasks-stat-sub">Awaiting verification</span>
        </button>

        <button
          type="button"
          className={`tasks-stat-card stat-completed ${
            filters.status === "Completed" ? "is-active" : ""
          }`}
          onClick={() => handleCardClick("completed")}
        >
          <div className="tasks-stat-top">
            <span className="tasks-stat-label">Completed</span>
            <span className="tasks-stat-icon">
              <CheckCircle2 size={18} />
            </span>
          </div>
          <strong className="tasks-stat-value">
            {summary ? summary.completed : "—"}
          </strong>
          <span className="tasks-stat-sub">Approved deliverables</span>
        </button>

        <button
          type="button"
          className={`tasks-stat-card stat-overdue ${
            filters.overdue ? "is-active" : ""
          }`}
          onClick={() => handleCardClick("overdue")}
        >
          <div className="tasks-stat-top">
            <span className="tasks-stat-label">Overdue Tasks</span>
            <span className="tasks-stat-icon">
              <AlertTriangle size={18} />
            </span>
          </div>
          <strong className="tasks-stat-value">
            {summary ? summary.overdue_tasks : "—"}
          </strong>
          <span className="tasks-stat-sub">Past scheduled due date</span>
        </button>
      </section>

      {/* Main Panel: Filters + Table */}
      <section className="tasks-panel">
        {/* Filter Bar */}
        <div className="tasks-filter-bar">
          <div className="tasks-filter-field">
            <label>Search</label>
            <div className="tasks-search-wrap">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by title or #ID..."
                value={filters.q}
                onChange={(e) => handleFilterChange("q", e.target.value)}
              />
            </div>
          </div>

          <div className="tasks-filter-field">
            <label>Project</label>
            <select
              value={filters.project_id}
              onChange={(e) => handleFilterChange("project_id", e.target.value)}
            >
              <option value="">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="tasks-filter-field">
            <label>Assigned Staff</label>
            <select
              value={filters.user_id}
              onChange={(e) => handleFilterChange("user_id", e.target.value)}
            >
              <option value="">All Staff</option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div className="tasks-filter-field">
            <label>User Role</label>
            <select
              value={filters.role}
              onChange={(e) => handleFilterChange("role", e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="employee">Employee</option>
              <option value="intern">Intern</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="tasks-filter-field">
            <label>Priority</label>
            <select
              value={filters.priority}
              onChange={(e) => handleFilterChange("priority", e.target.value)}
            >
              <option value="">All Priorities</option>
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="tasks-filter-field">
            <label>Status</label>
            <select
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

          <div className="tasks-filter-field">
            <label>Due Date</label>
            <input
              type="date"
              value={filters.due_date}
              onChange={(e) => handleFilterChange("due_date", e.target.value)}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="tasks-clear-btn"
              onClick={clearFilters}
              title="Reset all filters"
            >
              <Filter size={14} /> Clear
            </button>
          </div>
        </div>

        {/* Tasks Table */}
        <div className="tasks-table-wrapper">
          {loading ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "0.85rem" }}>
                Loading tasks from database...
              </p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="tasks-empty-state">
              <span className="tasks-empty-icon">
                <ClipboardList size={26} />
              </span>
              <strong>No tasks found</strong>
              <p>
                {filters.q ||
                filters.project_id ||
                filters.status ||
                filters.my_tasks
                  ? "No tasks match your selected filter criteria. Try clearing some filters."
                  : "No tasks have been created in the workspace yet."}
              </p>
              {canManage && (
                <button
                  type="button"
                  className="taskflow-btn-primary"
                  style={{ marginTop: 8 }}
                  onClick={() => setActiveModal("create")}
                >
                  <Plus size={16} /> Create Task
                </button>
              )}
            </div>
          ) : (
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Task Title</th>
                  <th>Project Name</th>
                  <th>Assigned To</th>
                  <th>Assigned By</th>
                  <th>Priority</th>
                  <th>Start Date</th>
                  <th>Due Date</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => {
                  const overdue = isOverdue(task.due_date, task.status);
                  return (
                    <tr key={task.id}>
                      {/* ID */}
                      <td>
                        <span className="task-id-badge">#{task.id}</span>
                      </td>

                      {/* Title */}
                      <td>
                        <div className="task-title-cell">
                          <strong>{task.title}</strong>
                          {task.description && (
                            <small>{task.description}</small>
                          )}
                        </div>
                      </td>

                      {/* Project */}
                      <td>
                        <div className="task-project-cell">
                          <strong>{task.project?.name || "—"}</strong>
                          <span className="task-dept-tag">
                            {task.project?.department}
                          </span>
                        </div>
                      </td>

                      {/* Assigned To */}
                      <td>
                        <div className="task-assignees-stack">
                          {task.assignees?.length > 0 ? (
                            <>
                              <div className="task-avatar-group">
                                {task.assignees.slice(0, 3).map((a) => (
                                  <span
                                    key={a.id}
                                    className="task-user-avatar"
                                    title={`${a.full_name} (${a.role})`}
                                  >
                                    {a.full_name?.trim().charAt(0).toUpperCase() ||
                                      "?"}
                                  </span>
                                ))}
                                {task.assignees.length > 3 && (
                                  <span
                                    className="task-user-avatar"
                                    style={{
                                      background: "#64748b",
                                      color: "#ffffff",
                                    }}
                                  >
                                    +{task.assignees.length - 3}
                                  </span>
                                )}
                              </div>
                              <div className="task-assignee-text">
                                <strong>
                                  {task.assignees.length === 1
                                    ? task.assignees[0].full_name
                                    : `${task.assignees.length} Members`}
                                </strong>
                                <small>
                                  {task.assignment_type || "Individual"}
                                </small>
                              </div>
                            </>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>Unassigned</span>
                          )}
                        </div>
                      </td>

                      {/* Assigned By */}
                      <td>
                        <span style={{ fontSize: "0.78rem", color: "#4b5563" }}>
                          {task.assigned_by?.full_name || "—"}
                        </span>
                      </td>

                      {/* Priority */}
                      <td>
                        <span
                          className={`task-priority-badge priority-${task.priority?.toLowerCase()}`}
                        >
                          {task.priority}
                        </span>
                      </td>

                      {/* Start Date */}
                      <td className="task-date-cell">
                        {formatDate(task.start_date)}
                      </td>

                      {/* Due Date */}
                      <td
                        className={`task-date-cell ${
                          overdue ? "task-date-overdue" : ""
                        }`}
                      >
                        {formatDate(task.due_date)}
                        {overdue && (
                          <span
                            title="This task is overdue!"
                            style={{
                              display: "inline-block",
                              marginLeft: 4,
                              fontSize: "0.68rem",
                            }}
                          >
                            ⚠️
                          </span>
                        )}
                      </td>

                      {/* Progress */}
                      <td>
                        <div className="task-progress-cell">
                          <div className="task-progress-track">
                            <div
                              className={`task-progress-fill ${
                                task.progress === 100 ? "is-complete" : ""
                              }`}
                              style={{ width: `${task.progress || 0}%` }}
                            />
                          </div>
                          <span className="task-progress-label">
                            {task.progress || 0}%
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <span
                          className={`task-status-badge status-${task.status
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {task.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="task-action-buttons">
                          {/* View details */}
                          <button
                            type="button"
                            className="task-action-btn"
                            title="View Details"
                            onClick={() => {
                              setSelectedTask(task);
                              setActiveModal("details");
                            }}
                          >
                            <Eye size={15} />
                          </button>

                          {/* Update progress */}
                          <button
                            type="button"
                            className="task-action-btn"
                            title="Update Progress"
                            onClick={() => {
                              setSelectedTask(task);
                              setActiveModal("progress");
                            }}
                          >
                            <Sliders size={15} />
                          </button>

                          {/* Submit for review */}
                          {task.status !== "Completed" && (
                            <button
                              type="button"
                              className="task-action-btn"
                              title="Submit for Review"
                              onClick={() => {
                                setSelectedTask(task);
                                setActiveModal("submit_review");
                              }}
                            >
                              <Send size={15} />
                            </button>
                          )}

                          {/* Review if submitted */}
                          {canManage &&
                            task.status === "Submitted for Review" && (
                              <button
                                type="button"
                                className="task-action-btn btn-review"
                                title="Review Submission"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setActiveModal("review");
                                }}
                              >
                                <FileCheck2 size={15} />
                              </button>
                            )}

                          {/* Assign */}
                          {canManage && (
                            <button
                              type="button"
                              className="task-action-btn"
                              title="Assign Team Members"
                              onClick={() => {
                                setSelectedTask(task);
                                setActiveModal("assign");
                              }}
                            >
                              <UserPlus size={15} />
                            </button>
                          )}

                          {/* Edit */}
                          {canManage && (
                            <button
                              type="button"
                              className="task-action-btn"
                              title="Edit Task"
                              onClick={() => {
                                setSelectedTask(task);
                                setActiveModal("edit");
                              }}
                            >
                              <Edit2 size={15} />
                            </button>
                          )}

                          {/* Delete */}
                          {canManage && (
                            <button
                              type="button"
                              className="task-action-btn btn-delete"
                              title="Delete Task"
                              onClick={() => handleDelete(task.id)}
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
              Showing {(page - 1) * pageSize + 1}–
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
              {Array.from({ length: totalPages }).map((_, i) => {
                const pageNum = i + 1;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`tasks-page-btn ${
                      page === pageNum ? "is-active" : ""
                    }`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
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

      {/* Modals */}
      {activeModal === "create" && (
        <CreateTaskModal
          onClose={() => setActiveModal(null)}
          onSuccess={(msg) => {
            setFeedback(msg);
            setRetry((v) => v + 1);
          }}
          projects={projects}
          assignableUsers={assignableUsers}
        />
      )}

      {activeModal === "edit" && selectedTask && (
        <EditTaskModal
          task={selectedTask}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onSuccess={(msg) => {
            setFeedback(msg);
            setRetry((v) => v + 1);
          }}
          projects={projects}
        />
      )}

      {activeModal === "assign" && selectedTask && (
        <AssignTaskModal
          task={selectedTask}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onSuccess={(msg) => {
            setFeedback(msg);
            setRetry((v) => v + 1);
          }}
          assignableUsers={assignableUsers}
        />
      )}

      {activeModal === "progress" && selectedTask && (
        <UpdateProgressModal
          task={selectedTask}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onSuccess={(msg) => {
            setFeedback(msg);
            setRetry((v) => v + 1);
          }}
        />
      )}

      {activeModal === "submit_review" && selectedTask && (
        <SubmitReviewModal
          task={selectedTask}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onSuccess={(msg) => {
            setFeedback(msg);
            setRetry((v) => v + 1);
          }}
        />
      )}

      {activeModal === "review" && selectedTask && (
        <ReviewTaskModal
          task={selectedTask}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onSuccess={(msg) => {
            setFeedback(msg);
            setRetry((v) => v + 1);
          }}
        />
      )}

      {activeModal === "details" && selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          onClose={() => {
            setActiveModal(null);
            setSelectedTask(null);
          }}
          onEdit={(t) => {
            setSelectedTask(t);
            setActiveModal("edit");
          }}
          onAssign={(t) => {
            setSelectedTask(t);
            setActiveModal("assign");
          }}
          onProgress={(t) => {
            setSelectedTask(t);
            setActiveModal("progress");
          }}
          onSubmitReview={(t) => {
            setSelectedTask(t);
            setActiveModal("submit_review");
          }}
          onReview={(t) => {
            setSelectedTask(t);
            setActiveModal("review");
          }}
          canManage={canManage}
        />
      )}
    </div>
  );
}
