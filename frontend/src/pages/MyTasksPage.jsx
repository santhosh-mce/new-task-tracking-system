import { useEffect, useState } from "react";
import {
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  ClipboardList,
  Edit3,
  Send,
  RotateCcw,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import api from "../api.js";
import AccessibleModal from "../components/AccessibleModal.jsx";
import "./AdminTasks.css";

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

function getStatusBadgeClass(status) {
  switch (status) {
    case "In Progress":
      return "task-status-badge status-in-progress";
    case "Submitted for Review":
      return "task-status-badge status-submitted-for-review";
    case "Changes Requested":
      return "task-status-badge status-changes-requested";
    case "Completed":
      return "task-status-badge status-completed";
    default:
      return "task-status-badge status-assigned";
  }
}

export default function MyTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [retry, setRetry] = useState(0);

  // New Task Modal state
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [plannedStart, setPlannedStart] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Progress update modal state
  const [progressModalTask, setProgressModalTask] = useState(null);
  const [progressVal, setProgressVal] = useState(0);
  const [progressComment, setProgressComment] = useState("");
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState("");

  // Submit for review modal state
  const [reviewModalTask, setReviewModalTask] = useState(null);
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // Edit Task modal state
  const [editModalTask, setEditModalTask] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPlannedStart, setEditPlannedStart] = useState("");
  const [editPlannedEnd, setEditPlannedEnd] = useState("");
  const [editPriority, setEditPriority] = useState("Medium");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editFieldErrors, setEditFieldErrors] = useState({});

  // Delete Task modal state
  const [deleteModalTask, setDeleteModalTask] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Load daily tasks assigned to authenticated user
  useEffect(() => {
    let cancelled = false;
    async function loadMyTasks() {
      setLoading(true);
      setError("");
      try {
        const res = await api.get("/api/tasks", {
          params: { page: 1, page_size: 100, my_tasks: true },
        });
        if (!cancelled) {
          setTasks(res.data.items || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Unable to load your daily tasks.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadMyTasks();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  // Handle opening New Task Modal
  function handleOpenNewTaskModal() {
    const todayStr = new Date().toISOString().split("T")[0];
    setNewTitle("");
    setNewDescription("");
    setPlannedStart(todayStr);
    setPlannedEnd(todayStr);
    setModalError("");
    setFieldErrors({});
    setShowNewTaskModal(true);
  }

  // Validate New Task Form
  function validateNewTaskForm() {
    const errors = {};
    if (!newTitle.trim()) {
      errors.title = "Task Title is required.";
    }
    if (!plannedStart) {
      errors.plannedStart = "Planned Start date is required.";
    }
    if (!plannedEnd) {
      errors.plannedEnd = "Planned End date is required.";
    }
    if (plannedStart && plannedEnd && plannedEnd < plannedStart) {
      errors.plannedEnd = "Planned End cannot be earlier than Planned Start.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Submit New Task Form
  async function handleCreateTask(e) {
    e.preventDefault();
    if (!validateNewTaskForm()) return;

    setModalLoading(true);
    setModalError("");

    try {
      await api.post("/api/tasks/personal", {
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        planned_start: plannedStart,
        planned_end: plannedEnd,
      });

      setShowNewTaskModal(false);
      setFeedback("Daily task created successfully!");
      setRetry((prev) => prev + 1);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setModalError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(", ")
          : "Failed to create task. Please verify required fields.",
      );
    } finally {
      setModalLoading(false);
    }
  }

  // Handle Progress Modal
  function handleOpenProgressModal(task) {
    setProgressModalTask(task);
    setProgressVal(task.progress || 0);
    setProgressComment("");
    setProgressError("");
  }

  async function handleSaveProgress(e) {
    e.preventDefault();
    if (!progressModalTask) return;

    setProgressLoading(true);
    setProgressError("");

    try {
      await api.patch(`/api/tasks/${progressModalTask.id}/progress`, {
        progress: parseInt(progressVal, 10),
        comment: progressComment.trim() || null,
      });
      setProgressModalTask(null);
      setFeedback("Task progress updated successfully!");
      setRetry((prev) => prev + 1);
    } catch (err) {
      setProgressError(
        err.response?.data?.detail || "Failed to update task progress.",
      );
    } finally {
      setProgressLoading(false);
    }
  }

  // Handle Submit For Review Modal
  function handleOpenReviewModal(task) {
    setReviewModalTask(task);
    setSubmissionNotes("");
    setReviewError("");
  }

  async function handleSubmitForReview(e) {
    e.preventDefault();
    if (!reviewModalTask) return;

    setReviewLoading(true);
    setReviewError("");

    try {
      await api.post(`/api/tasks/${reviewModalTask.id}/submit-review`, {
        submission_notes: submissionNotes.trim() || null,
      });
      setReviewModalTask(null);
      setFeedback("Task submitted for supervisor review!");
      setRetry((prev) => prev + 1);
    } catch (err) {
      setReviewError(
        err.response?.data?.detail || "Failed to submit task for review.",
      );
    } finally {
      setReviewLoading(false);
    }
  }

  // Handle Edit Modal
  function handleOpenEditModal(task) {
    setEditModalTask(task);
    setEditTitle(task.title || "");
    setEditDescription(task.description || "");
    setEditPlannedStart(task.start_date ? task.start_date.split("T")[0] : "");
    setEditPlannedEnd(task.due_date ? task.due_date.split("T")[0] : "");
    setEditPriority(task.priority || "Medium");
    setEditError("");
    setEditFieldErrors({});
  }

  function validateEditForm() {
    const errors = {};
    if (!editTitle.trim()) {
      errors.title = "Task Title is required.";
    }
    if (!editPlannedStart) {
      errors.plannedStart = "Planned Start date is required.";
    }
    if (!editPlannedEnd) {
      errors.plannedEnd = "Planned End date is required.";
    }
    if (editPlannedStart && editPlannedEnd && editPlannedEnd < editPlannedStart) {
      errors.plannedEnd = "Planned End cannot be earlier than Planned Start.";
    }
    setEditFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editModalTask) return;
    if (!validateEditForm()) return;

    setEditLoading(true);
    setEditError("");

    try {
      await api.put(`/api/tasks/${editModalTask.id}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        start_date: editPlannedStart || null,
        due_date: editPlannedEnd || null,
      });

      setEditModalTask(null);
      setFeedback("Task updated successfully!");
      setRetry((prev) => prev + 1);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setEditError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(", ")
          : "Failed to update task. Please verify required fields.",
      );
    } finally {
      setEditLoading(false);
    }
  }

  // Handle Delete Task
  async function handleConfirmDelete() {
    if (!deleteModalTask) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await api.delete(`/api/tasks/${deleteModalTask.id}`);
      setDeleteModalTask(null);
      setFeedback("Task deleted successfully!");
      setRetry((prev) => prev + 1);
    } catch (err) {
      setDeleteError(
        err.response?.data?.detail || "Failed to delete task. Please try again.",
      );
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="tasks-page">
      {/* Page Header */}
      <header className="tasks-heading">
        <div>
          <h1>My Tasks</h1>
          <p>Log and update your daily tasks</p>
        </div>
        <div className="tasks-header-actions">
          <button
            type="button"
            className="taskflow-btn-primary"
            onClick={handleOpenNewTaskModal}
            id="new-task-btn"
          >
            <Plus size={16} aria-hidden="true" />
            <span>New Task</span>
          </button>
        </div>
      </header>

      {/* Global Alerts */}
      {feedback && (
        <div className="tasks-alert tasks-alert-success" role="status">
          <span>{feedback}</span>
          <button
            type="button"
            className="tasks-alert-close"
            onClick={() => setFeedback("")}
            title="Dismiss"
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
            onClick={() => setRetry((v) => v + 1)}
          >
            <RotateCcw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="tasks-loading" role="status">
          <Clock size={28} className="animate-spin text-lime-600" />
          <p>Loading your daily tasks...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && tasks.length === 0 && (
        <div className="tasks-empty-state">
          <div className="tasks-empty-icon" aria-hidden="true">
            <ClipboardList size={36} color="#65a30d" />
          </div>
          <h3>No daily tasks logged yet</h3>
          <p>You have not logged any daily tasks yet. Click below to add your first task.</p>
          <button
            type="button"
            className="taskflow-btn-primary"
            onClick={handleOpenNewTaskModal}
          >
            <Plus size={16} aria-hidden="true" />
            <span>New Task</span>
          </button>
        </div>
      )}

      {/* Responsive Task Cards Grid */}
      {!loading && !error && tasks.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "18px",
          }}
          role="region"
          aria-label="My daily tasks list"
        >
          {tasks.map((task) => (
            <article
              key={task.id}
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                padding: "20px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                transition: "all 0.15s ease",
              }}
              id={`task-card-${task.id}`}
            >
              {/* Card Top Badges */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  className={getStatusBadgeClass(task.status)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    padding: "3px 9px",
                    borderRadius: "999px",
                    fontSize: "0.75rem",
                    fontWeight: 650,
                  }}
                >
                  {task.status}
                </span>

                {(task.start_date || task.due_date) && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "0.76rem",
                      color: "#6b7280",
                    }}
                  >
                    <Calendar size={13} aria-hidden="true" />
                    <span>
                      {formatDate(task.start_date)} – {formatDate(task.due_date)}
                    </span>
                  </span>
                )}
              </div>

              {/* Title & Description */}
              <div>
                <h2
                  style={{
                    margin: "0 0 6px",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "#111827",
                    lineHeight: 1.3,
                  }}
                >
                  {task.title}
                </h2>
                {task.description && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: "0.86rem",
                      color: "#4b5563",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {task.description}
                  </p>
                )}
              </div>

              {/* Progress Bar */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.76rem",
                    fontWeight: 650,
                    color: "#374151",
                    marginBottom: "5px",
                  }}
                >
                  <span>Progress</span>
                  <span>{task.progress || 0}%</span>
                </div>
                <div
                  style={{
                    width: "100%",
                    height: "6px",
                    background: "#e5e7eb",
                    borderRadius: "999px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, task.progress || 0))}%`,
                      height: "100%",
                      background: "#65a30d",
                      borderRadius: "999px",
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
              </div>

              {/* Card Footer Actions */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "auto",
                  paddingTop: "10px",
                  borderTop: "1px solid #f3f4f6",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="taskflow-btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                  onClick={() => handleOpenEditModal(task)}
                  id={`edit-task-btn-${task.id}`}
                  title="Edit task details"
                >
                  <Pencil size={13} aria-hidden="true" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  className="taskflow-btn-danger"
                  style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                  onClick={() => {
                    setDeleteModalTask(task);
                    setDeleteError("");
                  }}
                  id={`delete-task-btn-${task.id}`}
                  title="Delete task"
                >
                  <Trash2 size={13} aria-hidden="true" />
                  <span>Delete</span>
                </button>

                <button
                  type="button"
                  className="taskflow-btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                  onClick={() => handleOpenProgressModal(task)}
                  id={`update-progress-btn-${task.id}`}
                >
                  <Edit3 size={13} aria-hidden="true" />
                  <span>Update Progress</span>
                </button>

                {task.status !== "Completed" && task.status !== "Submitted for Review" && (
                  <button
                    type="button"
                    className="taskflow-btn-primary"
                    style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                    onClick={() => handleOpenReviewModal(task)}
                    id={`submit-review-btn-${task.id}`}
                  >
                    <Send size={13} aria-hidden="true" />
                    <span>Submit Review</span>
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* NEW TASK MODAL */}
      {showNewTaskModal && (
        <AccessibleModal
          title="New Task"
          onClose={() => setShowNewTaskModal(false)}
        >
          <form onSubmit={handleCreateTask} className="task-form" noValidate>
            {modalError && (
              <div className="tasks-alert tasks-alert-error" role="alert">
                <span>{modalError}</span>
              </div>
            )}

            <div className="task-field">
              <label htmlFor="new-task-title">
                Title <span className="required">*</span>
              </label>
              <input
                id="new-task-title"
                type="text"
                required
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Design system tokens overhaul"
              />
              {fieldErrors.title && (
                <span className="field-error-text" style={{ color: "#dc2626", fontSize: "0.78rem" }}>
                  {fieldErrors.title}
                </span>
              )}
            </div>

            <div className="task-field">
              <label htmlFor="new-task-desc">Description (Optional)</label>
              <textarea
                id="new-task-desc"
                rows={3}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief summary of what you plan to accomplish..."
              />
            </div>

            <div className="task-field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div className="task-field">
                <label htmlFor="new-task-start">
                  Planned Start <span className="required">*</span>
                </label>
                <input
                  id="new-task-start"
                  type="date"
                  required
                  value={plannedStart}
                  onChange={(e) => setPlannedStart(e.target.value)}
                />
                {fieldErrors.plannedStart && (
                  <span className="field-error-text" style={{ color: "#dc2626", fontSize: "0.78rem" }}>
                    {fieldErrors.plannedStart}
                  </span>
                )}
              </div>

              <div className="task-field">
                <label htmlFor="new-task-end">
                  Planned End <span className="required">*</span>
                </label>
                <input
                  id="new-task-end"
                  type="date"
                  required
                  value={plannedEnd}
                  onChange={(e) => setPlannedEnd(e.target.value)}
                />
                {fieldErrors.plannedEnd && (
                  <span className="field-error-text" style={{ color: "#dc2626", fontSize: "0.78rem" }}>
                    {fieldErrors.plannedEnd}
                  </span>
                )}
              </div>
            </div>

            <div
              className="task-form-actions"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "16px",
              }}
            >
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setShowNewTaskModal(false)}
                disabled={modalLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="taskflow-btn-primary"
                disabled={modalLoading}
                id="submit-create-task-btn"
              >
                {modalLoading ? "Creating..." : "Create Task"}
              </button>
            </div>
          </form>
        </AccessibleModal>
      )}

      {/* UPDATE PROGRESS MODAL */}
      {progressModalTask && (
        <AccessibleModal
          title={`Update Progress: ${progressModalTask.title}`}
          onClose={() => setProgressModalTask(null)}
        >
          <form onSubmit={handleSaveProgress} className="task-form">
            {progressError && (
              <div className="tasks-alert tasks-alert-error" role="alert">
                <span>{progressError}</span>
              </div>
            )}

            <div className="task-field">
              <label htmlFor="progress-range">
                Progress: <strong>{progressVal}%</strong>
              </label>
              <input
                id="progress-range"
                type="range"
                min="0"
                max="100"
                step="5"
                value={progressVal}
                onChange={(e) => setProgressVal(e.target.value)}
                style={{ accentColor: "#65a30d" }}
              />
            </div>

            <div className="task-field">
              <label htmlFor="progress-comment">Activity Comment (Optional)</label>
              <textarea
                id="progress-comment"
                rows={2}
                value={progressComment}
                onChange={(e) => setProgressComment(e.target.value)}
                placeholder="What was completed in this update?"
              />
            </div>

            <div className="task-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setProgressModalTask(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="taskflow-btn-primary"
                disabled={progressLoading}
              >
                {progressLoading ? "Saving..." : "Save Progress"}
              </button>
            </div>
          </form>
        </AccessibleModal>
      )}

      {/* SUBMIT FOR REVIEW MODAL */}
      {reviewModalTask && (
        <AccessibleModal
          title={`Submit for Review: ${reviewModalTask.title}`}
          onClose={() => setReviewModalTask(null)}
        >
          <form onSubmit={handleSubmitForReview} className="task-form">
            {reviewError && (
              <div className="tasks-alert tasks-alert-error" role="alert">
                <span>{reviewError}</span>
              </div>
            )}

            <p style={{ fontSize: "0.86rem", color: "#4b5563", margin: "0 0 12px" }}>
              Submitting this task marks it as <strong>Submitted for Review</strong> and notifies your supervisor for completion approval.
            </p>

            <div className="task-field">
              <label htmlFor="review-submission-notes">Submission Notes (Optional)</label>
              <textarea
                id="review-submission-notes"
                rows={3}
                value={submissionNotes}
                onChange={(e) => setSubmissionNotes(e.target.value)}
                placeholder="Include PR links, deliverables, or summary notes for the reviewer..."
              />
            </div>

            <div className="task-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setReviewModalTask(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="taskflow-btn-primary"
                disabled={reviewLoading}
              >
                {reviewLoading ? "Submitting..." : "Submit for Review"}
              </button>
            </div>
          </form>
        </AccessibleModal>
      )}

      {/* EDIT TASK MODAL */}
      {editModalTask && (
        <AccessibleModal
          title={`Edit Task: ${editModalTask.title}`}
          onClose={() => setEditModalTask(null)}
        >
          <form onSubmit={handleSaveEdit} className="task-form" noValidate>
            {editError && (
              <div className="tasks-alert tasks-alert-error" role="alert">
                <span>{editError}</span>
              </div>
            )}

            <div className="task-field">
              <label htmlFor="edit-task-title">
                Title <span className="required">*</span>
              </label>
              <input
                id="edit-task-title"
                type="text"
                required
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Task title"
              />
              {editFieldErrors.title && (
                <span className="field-error-text" style={{ color: "#dc2626", fontSize: "0.78rem" }}>
                  {editFieldErrors.title}
                </span>
              )}
            </div>

            <div className="task-field">
              <label htmlFor="edit-task-desc">Description (Optional)</label>
              <textarea
                id="edit-task-desc"
                rows={3}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Detailed summary or notes..."
              />
            </div>

            <div className="task-field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
              <div className="task-field">
                <label htmlFor="edit-task-start">
                  Planned Start <span className="required">*</span>
                </label>
                <input
                  id="edit-task-start"
                  type="date"
                  required
                  value={editPlannedStart}
                  onChange={(e) => setEditPlannedStart(e.target.value)}
                />
                {editFieldErrors.plannedStart && (
                  <span className="field-error-text" style={{ color: "#dc2626", fontSize: "0.78rem" }}>
                    {editFieldErrors.plannedStart}
                  </span>
                )}
              </div>

              <div className="task-field">
                <label htmlFor="edit-task-end">
                  Planned End <span className="required">*</span>
                </label>
                <input
                  id="edit-task-end"
                  type="date"
                  required
                  value={editPlannedEnd}
                  onChange={(e) => setEditPlannedEnd(e.target.value)}
                />
                {editFieldErrors.plannedEnd && (
                  <span className="field-error-text" style={{ color: "#dc2626", fontSize: "0.78rem" }}>
                    {editFieldErrors.plannedEnd}
                  </span>
                )}
              </div>
            </div>

            <div className="task-field">
              <label htmlFor="edit-task-priority">Priority</label>
              <select
                id="edit-task-priority"
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value)}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div
              className="task-form-actions"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "16px",
              }}
            >
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setEditModalTask(null)}
                disabled={editLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="taskflow-btn-primary"
                disabled={editLoading}
                id="submit-edit-task-btn"
              >
                {editLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </AccessibleModal>
      )}

      {/* DELETE TASK CONFIRMATION MODAL */}
      {deleteModalTask && (
        <AccessibleModal
          title="Delete Task"
          onClose={() => setDeleteModalTask(null)}
        >
          <div className="task-form" style={{ gap: "18px" }}>
            {deleteError && (
              <div className="tasks-alert tasks-alert-error" role="alert">
                <span>{deleteError}</span>
              </div>
            )}

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
                aria-hidden="true"
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: "1rem", color: "#111827", fontWeight: 700 }}>
                  Confirm Task Deletion
                </h3>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "#4b5563", lineHeight: 1.55 }}>
                  Are you sure you want to delete task <strong>"{deleteModalTask.title}"</strong>? This will permanently delete this task and all associated progress logs. This action cannot be undone.
                </p>
              </div>
            </div>

            <div
              className="task-form-actions"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "8px",
              }}
            >
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setDeleteModalTask(null)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="taskflow-btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                id="confirm-delete-task-btn"
              >
                {deleteLoading ? "Deleting..." : "Delete Task"}
              </button>
            </div>
          </div>
        </AccessibleModal>
      )}
    </div>
  );
}
