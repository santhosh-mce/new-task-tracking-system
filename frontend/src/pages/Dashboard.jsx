import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  Filter,
  Layers,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sliders,
  Sparkles,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import api from "../api.js";
import AccessibleModal from "../components/AccessibleModal.jsx";
import AttendanceWidget from "../components/AttendanceWidget.jsx";
import EmployeeSidebar from "../components/EmployeeSidebar.jsx";
import NotificationBell from "../components/NotificationBell.jsx";
import NotificationsPage from "./NotificationsPage.jsx";
import CompleteProfilePage from "./CompleteProfilePage.jsx";
import { useAuth } from "../context/useAuth.js";
import "./AdminTasks.css";
import "./Attendance.css";
import "./EmployeeDashboard.css";

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

function formatMinutes(mins) {
  if (!mins || mins <= 0) return "0h 00m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatTime(isoString) {
  if (!isoString) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, clearAuth } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Sidebar navigation view: 'dashboard' | 'projects' | 'tasks' | 'notifications' | 'profile'
  const viewParam = searchParams.get("view");
  const [activeView, setActiveView] = useState(() => {
    if (viewParam && ["dashboard", "projects", "tasks", "notifications", "profile"].includes(viewParam)) {
      return viewParam;
    }
    return "dashboard";
  });

  useEffect(() => {
    if (viewParam && ["dashboard", "projects", "tasks", "notifications", "profile"].includes(viewParam)) {
      setActiveView(viewParam);
    } else if (!viewParam && activeView !== "dashboard") {
      setActiveView("dashboard");
    }
  }, [viewParam]);

  const handleSelectView = (viewId) => {
    setActiveView(viewId);
    if (viewId === "dashboard") {
      setSearchParams({});
    } else {
      setSearchParams({ view: viewId });
    }
  };
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Core Data States
  const [tasks, setTasks] = useState([]);
  const [summary, setSummary] = useState(null);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [attendanceToday, setAttendanceToday] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [dailyUpdatesList, setDailyUpdatesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [retry, setRetry] = useState(0);

  // Daily Work Update Submission Form State
  const [updateProjectId, setUpdateProjectId] = useState("");
  const [updateTaskId, setUpdateTaskId] = useState("");
  const [updateDescription, setUpdateDescription] = useState("");
  const [updateStatus, setUpdateStatus] = useState("In Progress");
  const [updateProgress, setUpdateProgress] = useState(50);
  const [updateBlockers, setUpdateBlockers] = useState("");
  const [updateTomorrowPlan, setUpdateTomorrowPlan] = useState("");
  const [updateAttachmentUrl, setUpdateAttachmentUrl] = useState("");
  const [updateLiveLink, setUpdateLiveLink] = useState("");
  const [updateRemarks, setUpdateRemarks] = useState("");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [submittingDailyUpdate, setSubmittingDailyUpdate] = useState(false);

  // Modals for Task and Project Details
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectModalTab, setProjectModalTab] = useState("overview"); // 'overview' | 'tasks' | 'team' | 'updates' | 'links'
  const [activeModal, setActiveModal] = useState(null); // 'task_details' | 'task_update' | 'submit_review' | 'project_details'
  
  // Task Update Modal Fields
  const [taskUpdateStatus, setTaskUpdateStatus] = useState("In Progress");
  const [taskUpdateProgress, setTaskUpdateProgress] = useState(0);
  const [taskUpdateDescription, setTaskUpdateDescription] = useState("");
  const [taskUpdateBlockers, setTaskUpdateBlockers] = useState("");
  const [taskUpdateLiveLink, setTaskUpdateLiveLink] = useState("");
  const [taskUpdateRemarks, setTaskUpdateRemarks] = useState("");
  const [submissionNotes, setSubmissionNotes] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");

  // Filters
  const [taskFilterStatus, setTaskFilterStatus] = useState("All");
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");

  function logout() {
    clearAuth();
    navigate("/", { replace: true });
  }

  // Load all dashboard data
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError("");
      try {
        const [sumRes, tasksRes, profRes, attTodayRes, attHistRes, dailyRes, projectsRes] =
          await Promise.all([
            api.get("/api/tasks/summary", { params: { my_tasks: true } }),
            api.get("/api/tasks/my-tasks", { params: { page: 1, page_size: 100 } }),
            api.get("/api/users/profile/me").catch(() => ({ data: { assigned_projects: [] } })),
            api.get("/api/attendance/today").catch(() => ({ data: null })),
            api.get("/api/attendance/my-history").catch(() => ({ data: [] })),
            api.get("/api/tasks/daily-updates", { params: { limit: 50 } }).catch(() => ({ data: [] })),
            api.get("/api/projects", { params: { page_size: 50 } }).catch(() => ({ data: { items: [] } })),
          ]);

        if (!cancelled) {
          setSummary(sumRes.data);
          const taskItems = tasksRes.data?.items || [];
          setTasks(taskItems);

          // Merge profile assigned projects with projects API list
          const projList = projectsRes.data?.items || [];
          const profProjects = profRes.data?.assigned_projects || [];
          const combinedProjects = projList.length > 0 ? projList : profProjects;
          setAssignedProjects(combinedProjects);

          setAttendanceToday(attTodayRes.data);
          setAttendanceHistory(Array.isArray(attHistRes.data) ? attHistRes.data : []);
          setDailyUpdatesList(Array.isArray(dailyRes.data) ? dailyRes.data : []);

          // Set default task/project for daily update form
          if (taskItems.length > 0 && !updateTaskId) {
            setUpdateTaskId(String(taskItems[0].id));
            setUpdateProgress(taskItems[0].progress || 50);
            if (taskItems[0].project_id) {
              setUpdateProjectId(String(taskItems[0].project_id));
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Unable to load workspace data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  // Derived Task Counts
  const pendingTasksCount = useMemo(
    () => tasks.filter((t) => t.status === "Assigned" || t.status === "Pending").length,
    [tasks]
  );
  const inProgressTasksCount = useMemo(
    () => tasks.filter((t) => t.status === "In Progress").length,
    [tasks]
  );
  const completedTasksCount = useMemo(
    () => tasks.filter((t) => t.status === "Completed").length,
    [tasks]
  );
  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "Completed");
  }, [tasks]);

  // Report Metrics
  const reportStats = useMemo(() => {
    const total = summary?.total_tasks || tasks.length || 0;
    const completed = summary?.completed || completedTasksCount;
    const inProgress = summary?.in_progress || inProgressTasksCount;
    const pending = summary?.pending_review || 0;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      completed,
      inProgress,
      pending,
      completionRate,
      overdue: overdueTasks.length,
    };
  }, [summary, tasks, completedTasksCount, inProgressTasksCount, overdueTasks]);

  // Attendance Monthly Summary
  const attendanceReport = useMemo(() => {
    const records = attendanceHistory || [];
    const presentCount = records.filter(
      (r) => r.status === "Present" || r.status === "Late"
    ).length;
    const lateCount = records.filter((r) => r.status === "Late").length;
    const onTimeRate =
      presentCount > 0 ? Math.round(((presentCount - lateCount) / presentCount) * 100) : 100;
    const totalWorkMins = records.reduce((acc, r) => acc + (r.net_work_minutes || 0), 0);
    return {
      presentCount,
      lateCount,
      onTimeRate,
      totalWorkHours: (totalWorkMins / 60).toFixed(1),
    };
  }, [attendanceHistory]);

  // Tasks filtered by project selection in daily update form
  const availableTasksForDailyUpdate = useMemo(() => {
    if (!updateProjectId) return tasks;
    return tasks.filter((t) => String(t.project_id) === String(updateProjectId));
  }, [tasks, updateProjectId]);

  // Handle Attachment Upload
  async function handleAttachmentUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/api/users/profile/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUpdateAttachmentUrl(res.data.url);
      setFeedback("Supporting document uploaded successfully!");
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to upload file attachment.");
    } finally {
      setUploadingAttachment(false);
    }
  }

  // Handle Submit Daily Update
  async function handleSubmitDailyUpdate(e) {
    e.preventDefault();
    if (!updateDescription.trim()) {
      setError("Please provide today's work description.");
      return;
    }
    setSubmittingDailyUpdate(true);
    setError("");
    try {
      const payload = {
        project_id: updateProjectId ? parseInt(updateProjectId, 10) : null,
        task_id: updateTaskId ? parseInt(updateTaskId, 10) : null,
        work_description: updateDescription.trim(),
        work_status: updateStatus,
        progress_percentage: parseInt(updateProgress, 10),
        blockers: updateBlockers.trim() || null,
        tomorrow_plan: updateTomorrowPlan.trim() || null,
        attachment_url: updateAttachmentUrl || null,
        live_link: updateLiveLink.trim() || null,
        remarks: updateRemarks.trim() || null,
      };

      await api.post("/api/tasks/daily-updates", payload);
      setFeedback("Daily work update submitted successfully! Your team lead and manager can now review it.");
      setUpdateDescription("");
      setUpdateBlockers("");
      setUpdateTomorrowPlan("");
      setUpdateAttachmentUrl("");
      setUpdateLiveLink("");
      setUpdateRemarks("");
      setRetry((v) => v + 1);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to submit daily update.");
    } finally {
      setSubmittingDailyUpdate(false);
    }
  }

  // Open Task Details Modal
  function handleOpenTaskDetails(task) {
    setSelectedTask(task);
    setActiveModal("task_details");
  }

  // Open Task Update Modal
  function handleOpenTaskUpdate(task) {
    setSelectedTask(task);
    setTaskUpdateStatus(task.status || "In Progress");
    setTaskUpdateProgress(task.progress || 0);
    setTaskUpdateDescription("");
    setTaskUpdateBlockers("");
    setTaskUpdateLiveLink("");
    setTaskUpdateRemarks("");
    setModalError("");
    setActiveModal("task_update");
  }

  // Submit Task Update
  async function handleSaveTaskUpdate(e) {
    e.preventDefault();
    if (!selectedTask) return;
    setModalLoading(true);
    setModalError("");
    try {
      // 1. Submit daily update log
      await api.post("/api/tasks/daily-updates", {
        task_id: selectedTask.id,
        project_id: selectedTask.project_id || null,
        work_description: taskUpdateDescription.trim() || `Progress updated to ${taskUpdateProgress}%.`,
        work_status: taskUpdateStatus,
        progress_percentage: parseInt(taskUpdateProgress, 10),
        blockers: taskUpdateBlockers.trim() || null,
        live_link: taskUpdateLiveLink.trim() || null,
        remarks: taskUpdateRemarks.trim() || null,
      });

      // 2. Also update progress endpoint
      await api.patch(`/api/tasks/${selectedTask.id}/progress`, {
        progress: parseInt(taskUpdateProgress, 10),
        status: taskUpdateStatus,
        comment: taskUpdateDescription.trim() || null,
      });

      setFeedback("Task progress and daily log saved successfully!");
      setActiveModal(null);
      setRetry((v) => v + 1);
    } catch (err) {
      setModalError(err.response?.data?.detail || "Failed to update task.");
    } finally {
      setModalLoading(false);
    }
  }

  // Submit Deliverable for Review
  async function handleSubmitReview(e) {
    e.preventDefault();
    if (!selectedTask) return;
    setModalLoading(true);
    setModalError("");
    try {
      await api.post(`/api/tasks/${selectedTask.id}/submit-review`, {
        submission_notes: submissionNotes.trim() || null,
      });
      setFeedback("Deliverable submitted for review! Manager and Team Lead notified.");
      setActiveModal(null);
      setRetry((v) => v + 1);
    } catch (err) {
      setModalError(err.response?.data?.detail || "Failed to submit task for review.");
    } finally {
      setModalLoading(false);
    }
  }

  // Open Project Details Modal
  function handleOpenProjectDetails(proj) {
    setSelectedProject(proj);
    setProjectModalTab("overview");
    setActiveModal("project_details");
  }

  const roleLabel =
    user?.role === "intern"
      ? "Intern"
      : user?.role === "team_lead"
      ? "Team Lead"
      : user?.role === "manager"
      ? "Manager"
      : "Employee";

  // Filter tasks in My Tasks view
  const filteredTasksList = useMemo(() => {
    return tasks.filter((t) => {
      const matchStatus =
        taskFilterStatus === "All" ||
        (taskFilterStatus === "Overdue"
          ? t.due_date && t.due_date < new Date().toISOString().split("T")[0] && t.status !== "Completed"
          : t.status.toLowerCase() === taskFilterStatus.toLowerCase());
      const matchSearch =
        !taskSearchQuery.trim() ||
        t.title.toLowerCase().includes(taskSearchQuery.toLowerCase()) ||
        (t.project_name && t.project_name.toLowerCase().includes(taskSearchQuery.toLowerCase()));
      return matchStatus && matchSearch;
    });
  }, [tasks, taskFilterStatus, taskSearchQuery]);

  // Filter projects in My Projects view
  const filteredProjectsList = useMemo(() => {
    return assignedProjects.filter((p) => {
      if (!projectSearchQuery.trim()) return true;
      const q = projectSearchQuery.toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q)
      );
    });
  }, [assignedProjects, projectSearchQuery]);

  // Tasks belonging to selected project for Project Details Modal
  const projectTasksList = useMemo(() => {
    if (!selectedProject) return [];
    return tasks.filter((t) => t.project_id === selectedProject.id);
  }, [tasks, selectedProject]);

  // Daily updates for selected project
  const projectDailyUpdates = useMemo(() => {
    if (!selectedProject) return [];
    return dailyUpdatesList.filter(
      (u) => u.project_id === selectedProject.id || u.project?.id === selectedProject.id
    );
  }, [dailyUpdatesList, selectedProject]);

  return (
    <div className="staff-dashboard-shell">
      {/* Dedicated Employee/Intern Sidebar */}
      <EmployeeSidebar
        activeView={activeView}
        onSelectView={handleSelectView}
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        onLogout={logout}
        user={user}
      />

      <div className="staff-main-column">
        {/* Topbar */}
        <header className="staff-topbar">
          <div className="staff-topbar-left">
            <button
              type="button"
              className="staff-menu-btn"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <div className="staff-topbar-title">
              <span>TaskFlow Workspace · {roleLabel}</span>
              <strong>
                {activeView === "dashboard"
                  ? "Dashboard Overview"
                  : activeView === "projects"
                  ? "My Projects"
                  : activeView === "tasks"
                  ? "My Tasks"
                  : activeView === "notifications"
                  ? "Notifications"
                  : "My Profile"}
              </strong>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <NotificationBell />
            <button
              type="button"
              className={`profile-btn-secondary${activeView === "profile" ? " is-active" : ""}`}
              onClick={() => handleSelectView("profile")}
              style={{
                fontSize: "0.82rem",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
              }}
            >
              <User size={14} /> My Profile
            </button>
            <button
              type="button"
              className="profile-btn-secondary"
              onClick={logout}
              style={{ fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="staff-dashboard-content">
          {/* Alerts */}
          {feedback && (
            <div className="tasks-alert tasks-alert-success" style={{ marginBottom: 20 }}>
              <CheckCircle2 size={18} />
              <span>{feedback}</span>
              <button
                type="button"
                className="tasks-alert-close"
                onClick={() => setFeedback("")}
              >
                ✕
              </button>
            </div>
          )}

          {error && (
            <div className="tasks-alert tasks-alert-error" style={{ marginBottom: 20 }}>
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setRetry((v) => v + 1)}
                style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "0.25rem 0.6rem" }}
              >
                Retry
              </button>
            </div>
          )}

          {/* VIEW: DASHBOARD OVERVIEW */}
          {activeView === "dashboard" && (
            <>
              {/* Hero Banner */}
              <section className="staff-hero">
                <span className="staff-hero-badge">
                  <Sparkles size={14} /> {roleLabel} Workspace
                </span>
                <h1>Welcome back, {user?.full_name}!</h1>
                <p>
                  Here is your real-time daily work summary. Track assigned tasks, submit daily updates, review project milestones, and manage attendance logs.
                </p>
              </section>

              {/* SECTION A: SUMMARY CARDS (6 CARDS) */}
              <section className="staff-summary-grid">
                {/* 1. My Projects */}
                <div className="staff-summary-card">
                  <div className="staff-summary-card-top">
                    <span className="staff-summary-card-label">My Projects</span>
                    <div className="staff-summary-card-icon" style={{ background: "#f0fdf4", color: "#166534" }}>
                      <Briefcase size={18} />
                    </div>
                  </div>
                  <div className="staff-summary-card-value">{assignedProjects.length}</div>
                  <div className="staff-summary-card-sub">Assigned projects</div>
                </div>

                {/* 2. My Tasks */}
                <div className="staff-summary-card">
                  <div className="staff-summary-card-top">
                    <span className="staff-summary-card-label">My Tasks</span>
                    <div className="staff-summary-card-icon" style={{ background: "#f8fafc", color: "#475569" }}>
                      <FileCheck size={18} />
                    </div>
                  </div>
                  <div className="staff-summary-card-value">{tasks.length}</div>
                  <div className="staff-summary-card-sub">Total assignments</div>
                </div>

                {/* 3. Pending Tasks */}
                <div className="staff-summary-card">
                  <div className="staff-summary-card-top">
                    <span className="staff-summary-card-label">Pending Tasks</span>
                    <div className="staff-summary-card-icon" style={{ background: "#fffbeb", color: "#b45309" }}>
                      <Clock size={18} />
                    </div>
                  </div>
                  <div className="staff-summary-card-value">{pendingTasksCount}</div>
                  <div className="staff-summary-card-sub">Yet to start</div>
                </div>

                {/* 4. In Progress */}
                <div className="staff-summary-card">
                  <div className="staff-summary-card-top">
                    <span className="staff-summary-card-label">In Progress</span>
                    <div className="staff-summary-card-icon" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                      <TrendingUp size={18} />
                    </div>
                  </div>
                  <div className="staff-summary-card-value">{inProgressTasksCount}</div>
                  <div className="staff-summary-card-sub">Currently working</div>
                </div>

                {/* 5. Completed Tasks */}
                <div className="staff-summary-card">
                  <div className="staff-summary-card-top">
                    <span className="staff-summary-card-label">Completed Tasks</span>
                    <div className="staff-summary-card-icon" style={{ background: "#f0fdf4", color: "#65a30d" }}>
                      <CheckCircle2 size={18} />
                    </div>
                  </div>
                  <div className="staff-summary-card-value">{completedTasksCount}</div>
                  <div className="staff-summary-card-sub">Finished deliverables</div>
                </div>

                {/* 6. Today's Attendance */}
                <div className="staff-summary-card">
                  <div className="staff-summary-card-top">
                    <span className="staff-summary-card-label">Today's Attendance</span>
                    <div className="staff-summary-card-icon" style={{ background: "#faf5ff", color: "#7e22ce" }}>
                      <UserCheck size={18} />
                    </div>
                  </div>
                  <div className="staff-summary-card-value" style={{ fontSize: "1.2rem" }}>
                    {attendanceToday?.first_check_in
                      ? formatTime(attendanceToday.first_check_in)
                      : "Not In"}
                  </div>
                  <div className="staff-summary-card-sub">
                    <span
                      className={`staff-att-badge ${
                        attendanceToday?.status === "Present"
                          ? "present"
                          : attendanceToday?.status === "Late"
                          ? "late"
                          : "break"
                      }`}
                    >
                      {attendanceToday?.status || "Pending"}
                    </span>
                  </div>
                </div>
              </section>

              {/* OVERDUE TASKS BANNER IF ANY */}
              {overdueTasks.length > 0 && (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 10,
                    padding: "0.85rem 1.25rem",
                    marginBottom: "1.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <AlertTriangle size={20} color="#dc2626" />
                    <div>
                      <strong style={{ color: "#991b1b", fontSize: "0.9rem" }}>
                        Action Required: {overdueTasks.length} Overdue Task{overdueTasks.length > 1 ? "s" : ""}
                      </strong>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#b91c1c" }}>
                        Please review completion deadlines and submit an update or request review.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="taskflow-btn-secondary"
                    onClick={() => {
                      setActiveView("tasks");
                      setTaskFilterStatus("Overdue");
                    }}
                    style={{ fontSize: "0.8rem", padding: "0.35rem 0.75rem", borderColor: "#fca5a5", color: "#991b1b" }}
                  >
                    View Overdue
                  </button>
                </div>
              )}

              {/* SECTION B: MY TASKS TABLE SECTION */}
              <section className="staff-card">
                <div className="staff-card-header">
                  <div className="staff-card-title">
                    <FileCheck size={20} /> My Assigned Tasks ({tasks.length})
                  </div>
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={() => setActiveView("tasks")}
                    style={{ fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    View All in My Tasks <ChevronRight size={14} />
                  </button>
                </div>

                {loading ? (
                  <p style={{ textAlign: "center", color: "#64748b", margin: 20 }}>Loading tasks...</p>
                ) : tasks.length === 0 ? (
                  <div className="tasks-empty-state">
                    <CheckCircle2 size={24} />
                    <strong>No tasks currently assigned to you!</strong>
                    <p>New assignments will appear here once allocated by your manager or team lead.</p>
                  </div>
                ) : (
                  <div className="tasks-table-wrapper">
                    <table className="tasks-table">
                      <thead>
                        <tr>
                          <th>Task Name</th>
                          <th>Project</th>
                          <th>Due Date</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Progress</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tasks.slice(0, 5).map((t) => (
                          <tr key={t.id}>
                            <td>
                              <button
                                type="button"
                                onClick={() => handleOpenTaskDetails(t)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  color: "#0f172a",
                                  fontWeight: 750,
                                  cursor: "pointer",
                                  textAlign: "left",
                                  textDecoration: "underline",
                                }}
                              >
                                {t.title}
                              </button>
                            </td>
                            <td>{t.project_name || t.project?.name || "—"}</td>
                            <td>{formatDate(t.due_date)}</td>
                            <td>
                              <span className={`tasks-priority-pill priority-${(t.priority || "Medium").toLowerCase()}`}>
                                {t.priority}
                              </span>
                            </td>
                            <td>
                              <span className={`tasks-status-pill status-${(t.status || "Assigned").toLowerCase().replace(/\s+/g, "-")}`}>
                                {t.status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 60, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ width: `${t.progress}%`, height: "100%", background: "#65a30d" }} />
                                </div>
                                <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>{t.progress}%</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  type="button"
                                  className="tasks-row-action"
                                  onClick={() => handleOpenTaskDetails(t)}
                                  title="View Details"
                                >
                                  <Eye size={13} /> Details
                                </button>
                                <button
                                  type="button"
                                  className="tasks-row-action"
                                  onClick={() => handleOpenTaskUpdate(t)}
                                  title="Update Task"
                                >
                                  <Sliders size={13} /> Update
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* SECTION C: MY PROJECTS SECTION */}
              <section className="staff-card">
                <div className="staff-card-header">
                  <div className="staff-card-title">
                    <Briefcase size={20} /> My Projects ({assignedProjects.length})
                  </div>
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={() => setActiveView("projects")}
                    style={{ fontSize: "0.82rem", display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    View All Projects <ChevronRight size={14} />
                  </button>
                </div>

                {assignedProjects.length === 0 ? (
                  <p style={{ color: "#64748b", margin: 12 }}>No projects assigned yet.</p>
                ) : (
                  <div className="staff-proj-grid">
                    {assignedProjects.slice(0, 4).map((p) => (
                      <div
                        key={p.id}
                        className="staff-proj-card"
                        onClick={() => handleOpenProjectDetails(p)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="staff-proj-header">
                          <h3 className="staff-proj-title">{p.name}</h3>
                          <span className="staff-proj-dept">{p.department}</span>
                        </div>
                        <p style={{ fontSize: "0.82rem", color: "#64748b", margin: "4px 0 10px", lineClamp: 2 }}>
                          {p.description || "Active workspace project."}
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.8rem", color: "#334155" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Role:</span>
                            <strong style={{ color: "#65a30d" }}>{roleLabel}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Status:</span>
                            <strong>{p.status}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Timeline:</span>
                            <span>{formatDate(p.start_date)} - {formatDate(p.end_date)}</span>
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <span>Progress</span>
                              <strong>{p.completion_percent || 0}%</strong>
                            </div>
                            <div style={{ width: "100%", height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${p.completion_percent || 0}%`, height: "100%", background: "#65a30d" }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* SECTION D: DAILY UPDATES SECTION */}
              <section className="staff-card">
                <div className="staff-card-header">
                  <div className="staff-card-title">
                    <CalendarCheck size={20} /> Daily Work Updates
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    Log Daily Accomplishments
                  </span>
                </div>

                <div className="daily-update-box">
                  <form onSubmit={handleSubmitDailyUpdate} className="daily-form-grid">
                    {/* Date (automatic) */}
                    <div>
                      <label className="daily-update-label">Date (Automatic)</label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date())}
                        className="profile-input"
                        style={{ background: "#f1f5f9", cursor: "not-allowed" }}
                      />
                    </div>

                    {/* Project dropdown */}
                    <div>
                      <label className="daily-update-label">Project Name</label>
                      <select
                        className="profile-select"
                        value={updateProjectId}
                        onChange={(e) => {
                          setUpdateProjectId(e.target.value);
                          // reset task if not matching
                          const pTasks = tasks.filter((t) => String(t.project_id) === e.target.value);
                          if (pTasks.length > 0) setUpdateTaskId(String(pTasks[0].id));
                        }}
                      >
                        <option value="">General / Select Project</option>
                        {assignedProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.department})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Task dropdown */}
                    <div>
                      <label className="daily-update-label">Task Name</label>
                      <select
                        className="profile-select"
                        value={updateTaskId}
                        onChange={(e) => {
                          setUpdateTaskId(e.target.value);
                          const t = tasks.find((tk) => String(tk.id) === e.target.value);
                          if (t) {
                            setUpdateProgress(t.progress || 50);
                            setUpdateStatus(t.status || "In Progress");
                          }
                        }}
                      >
                        <option value="">Select Task</option>
                        {availableTasksForDailyUpdate.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title} ({t.progress}% - {t.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Work Status */}
                    <div>
                      <label className="daily-update-label">Work Status</label>
                      <select
                        className="profile-select"
                        value={updateStatus}
                        onChange={(e) => setUpdateStatus(e.target.value)}
                      >
                        <option value="In Progress">In Progress</option>
                        <option value="Submitted for Review">Submitted for Review</option>
                        <option value="Completed">Completed</option>
                        <option value="Pending">Pending / Yet to Start</option>
                        <option value="Changes Requested">Changes Requested</option>
                      </select>
                    </div>

                    {/* Progress Slider */}
                    <div className="daily-form-full">
                      <label className="daily-update-label">
                        <span>Progress Percentage</span>
                        <strong>{updateProgress}%</strong>
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={updateProgress}
                        onChange={(e) => setUpdateProgress(e.target.value)}
                        style={{ width: "100%", accentColor: "#65a30d" }}
                      />
                    </div>

                    {/* Today's work description */}
                    <div className="daily-form-full">
                      <label className="daily-update-label">
                        Today's Work Description <span style={{ color: "#dc2626" }}>*</span>
                      </label>
                      <textarea
                        rows={3}
                        required
                        className="profile-textarea"
                        value={updateDescription}
                        onChange={(e) => setUpdateDescription(e.target.value)}
                        placeholder="Detail the modules coded, bugs resolved, tests run, or tasks progressed today..."
                      />
                    </div>

                    {/* Challenges / Blockers */}
                    <div>
                      <label className="daily-update-label">Challenges / Blockers (if any)</label>
                      <textarea
                        rows={2}
                        className="profile-textarea"
                        value={updateBlockers}
                        onChange={(e) => setUpdateBlockers(e.target.value)}
                        placeholder="Any impediments, missing requirements, or technical obstacles?"
                      />
                    </div>

                    {/* Tomorrow's Plan */}
                    <div>
                      <label className="daily-update-label">Tomorrow's Plan</label>
                      <textarea
                        rows={2}
                        className="profile-textarea"
                        value={updateTomorrowPlan}
                        onChange={(e) => setUpdateTomorrowPlan(e.target.value)}
                        placeholder="Next steps, components to develop, or reviews scheduled..."
                      />
                    </div>

                    {/* Supporting document / screenshot */}
                    <div>
                      <label className="daily-update-label">
                        <span>Supporting Document / Screenshot</span>
                        {uploadingAttachment && <small>Uploading...</small>}
                      </label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="file"
                          onChange={handleAttachmentUpload}
                          className="profile-input"
                          style={{ padding: "0.35rem", fontSize: "0.8rem" }}
                        />
                      </div>
                      {updateAttachmentUrl && (
                        <small style={{ color: "#166534", marginTop: 4, display: "block" }}>
                          ✓ Attached: {updateAttachmentUrl}
                        </small>
                      )}
                    </div>

                    {/* Live Link */}
                    <div>
                      <label className="daily-update-label">Live Link / PR URL (optional)</label>
                      <input
                        type="url"
                        className="profile-input"
                        placeholder="https://github.com/... or staging URL"
                        value={updateLiveLink}
                        onChange={(e) => setUpdateLiveLink(e.target.value)}
                      />
                    </div>

                    {/* Remarks */}
                    <div className="daily-form-full">
                      <label className="daily-update-label">Remarks / Notes</label>
                      <input
                        type="text"
                        className="profile-input"
                        placeholder="Any additional remarks for team lead or manager..."
                        value={updateRemarks}
                        onChange={(e) => setUpdateRemarks(e.target.value)}
                      />
                    </div>

                    <div className="daily-form-full" style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="submit"
                        disabled={submittingDailyUpdate}
                        className="profile-btn-primary"
                        style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                      >
                        <Send size={15} />
                        {submittingDailyUpdate ? "Saving Update..." : "Submit Daily Update"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Daily Updates Feed List */}
                <div style={{ marginTop: "1.5rem" }}>
                  <h3 style={{ fontSize: "0.95rem", color: "#1e293b", marginBottom: 12 }}>
                    Recent Daily Updates Feed ({dailyUpdatesList.length})
                  </h3>
                  {dailyUpdatesList.length === 0 ? (
                    <p style={{ color: "#64748b", fontSize: "0.85rem" }}>No daily updates submitted yet.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {dailyUpdatesList.slice(0, 6).map((item) => (
                        <div key={item.id} className="daily-update-card-item">
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                              <strong style={{ color: "#0f172a", fontSize: "0.9rem" }}>
                                {item.task?.title || "Project Activity"}
                              </strong>
                              {item.project && (
                                <span style={{ fontSize: "0.78rem", color: "#64748b", marginLeft: 8 }}>
                                  ({item.project.name})
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                              {item.update_date}
                            </span>
                          </div>

                          <p style={{ margin: 0, fontSize: "0.85rem", color: "#334155" }}>
                            {item.work_description}
                          </p>

                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                            <span className="daily-badge" style={{ background: "#f0fdf4", color: "#166534" }}>
                              {item.work_status} ({item.progress_percentage}%)
                            </span>
                            {item.blockers && (
                              <span className="daily-badge" style={{ background: "#fef2f2", color: "#dc2626" }}>
                                Blockers: {item.blockers}
                              </span>
                            )}
                            {item.tomorrow_plan && (
                              <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                                <strong>Tomorrow:</strong> {item.tomorrow_plan}
                              </span>
                            )}
                            {item.live_link && (
                              <a
                                href={item.live_link}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: "0.78rem", color: "#2563eb", display: "inline-flex", alignItems: "center", gap: 3 }}
                              >
                                <ExternalLink size={12} /> Live Link
                              </a>
                            )}
                            {item.attachment_url && (
                              <a
                                href={item.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: "0.78rem", color: "#65a30d", display: "inline-flex", alignItems: "center", gap: 3 }}
                              >
                                <Paperclip size={12} /> Attachment
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* SECTION E: ATTENDANCE SECTION */}
              <section className="staff-card">
                <div className="staff-card-header">
                  <div className="staff-card-title">
                    <Clock size={20} /> Attendance & Session Tracking
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    Asia/Kolkata
                  </span>
                </div>

                <div className="staff-grid-2" style={{ marginBottom: 0 }}>
                  {/* Attendance Action Widget */}
                  <div>
                    <AttendanceWidget
                      compact={true}
                      onActionComplete={() => setRetry((v) => v + 1)}
                    />
                  </div>

                  {/* Monthly Summary Statistics */}
                  <div style={{ background: "#f8fafc", padding: "1.25rem", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "#1e293b" }}>
                      Monthly Attendance Summary
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.85rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#64748b" }}>Today's Login Time:</span>
                        <strong>{attendanceToday?.first_check_in ? formatTime(attendanceToday.first_check_in) : "Not Logged In"}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#64748b" }}>Status:</span>
                        <strong style={{ color: attendanceToday?.status === "Present" ? "#166534" : "#b45309" }}>
                          {attendanceToday?.status || "Pending"}
                        </strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#64748b" }}>Days Present:</span>
                        <strong>{attendanceReport.presentCount} days ({attendanceReport.onTimeRate}% on-time)</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#64748b" }}>Total Work Hours:</span>
                        <strong>{attendanceReport.totalWorkHours} hrs</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Previous Attendance Records Table */}
                <div style={{ marginTop: "1.5rem" }}>
                  <h4 style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "#1e293b" }}>
                    Previous Attendance Logs
                  </h4>
                  {attendanceHistory.length === 0 ? (
                    <p style={{ color: "#64748b", fontSize: "0.85rem" }}>No attendance logs recorded yet.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="staff-att-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Check In</th>
                            <th>Check Out</th>
                            <th>Break Time</th>
                            <th>Net Work</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attendanceHistory.slice(0, 5).map((att) => (
                            <tr key={att.id}>
                              <td>{att.date}</td>
                              <td>
                                <span
                                  className={`staff-att-badge ${
                                    att.status === "Present"
                                      ? "present"
                                      : att.status === "Late"
                                      ? "late"
                                      : "break"
                                  }`}
                                >
                                  {att.status}
                                </span>
                              </td>
                              <td>{formatTime(att.first_check_in)}</td>
                              <td>{formatTime(att.last_check_out)}</td>
                              <td>{formatMinutes(att.total_break_minutes)}</td>
                              <td>
                                <strong>{formatMinutes(att.net_work_minutes)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              {/* SECTION F: REPORTS & PROGRESS SECTION */}
              <section className="staff-card">
                <div className="staff-card-header">
                  <div className="staff-card-title">
                    <BarChart3 size={20} /> Reports & Work Progress
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "#65a30d", fontWeight: 700 }}>
                    Live Work Analytics
                  </span>
                </div>

                <div className="report-metrics-grid">
                  <div className="report-metric-card">
                    <span className="report-metric-label">Completion Rate</span>
                    <strong className="report-metric-val">{reportStats.completionRate}%</strong>
                    <div className="report-progress-track">
                      <div className="report-progress-fill" style={{ width: `${reportStats.completionRate}%` }} />
                    </div>
                    <span className="report-metric-sub">
                      {reportStats.completed} of {reportStats.total} completed
                    </span>
                  </div>

                  <div className="report-metric-card">
                    <span className="report-metric-label">Active Work</span>
                    <strong className="report-metric-val">{reportStats.inProgress}</strong>
                    <span className="report-metric-sub" style={{ color: "#d97706" }}>
                      {reportStats.pending} in review · {pendingTasksCount} pending
                    </span>
                  </div>

                  <div className="report-metric-card">
                    <span className="report-metric-label">Monthly Hours Logged</span>
                    <strong className="report-metric-val">{attendanceReport.totalWorkHours}h</strong>
                    <span className="report-metric-sub">
                      {attendanceReport.presentCount} days logged ({attendanceReport.onTimeRate}% on-time)
                    </span>
                  </div>
                </div>

                {/* Project-wise Progress */}
                {assignedProjects.length > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <h4 style={{ margin: "0 0 10px", fontSize: "0.88rem", color: "#334155" }}>
                      Project-wise Progress
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {assignedProjects.map((p) => (
                        <div key={p.id} style={{ background: "#f8fafc", padding: "0.75rem 1rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.84rem" }}>
                            <strong>{p.name}</strong>
                            <span style={{ color: "#65a30d", fontWeight: 700 }}>{p.completion_percent || 0}%</span>
                          </div>
                          <div style={{ width: "100%", height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${p.completion_percent || 0}%`, height: "100%", background: "#65a30d" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {/* VIEW: MY PROJECTS */}
          {activeView === "projects" && (
            <div className="staff-card">
              <div className="staff-card-header">
                <div className="staff-card-title">
                  <Briefcase size={22} /> My Assigned Projects ({assignedProjects.length})
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      className="profile-input"
                      placeholder="Search projects..."
                      value={projectSearchQuery}
                      onChange={(e) => setProjectSearchQuery(e.target.value)}
                      style={{ paddingLeft: "2rem", width: 220 }}
                    />
                    <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                  </div>
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={() => setActiveView("dashboard")}
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>

              {filteredProjectsList.length === 0 ? (
                <div className="tasks-empty-state">
                  <Briefcase size={28} style={{ color: "#64748b", margin: "0 auto 8px" }} />
                  <strong>No projects assigned to you yet</strong>
                  <p>When you are assigned to a project team, it will appear here with full scope details.</p>
                </div>
              ) : (
                <div className="staff-proj-grid">
                  {filteredProjectsList.map((p) => {
                    const myTasksInProj = tasks.filter((t) => t.project_id === p.id);
                    return (
                      <div
                        key={p.id}
                        className="staff-proj-card"
                        onClick={() => handleOpenProjectDetails(p)}
                        style={{ cursor: "pointer" }}
                      >
                        <div className="staff-proj-header">
                          <h3 className="staff-proj-title">{p.name}</h3>
                          <span className="staff-proj-dept">{p.department}</span>
                        </div>
                        <p style={{ fontSize: "0.84rem", color: "#475569", margin: "6px 0 12px", minHeight: 40 }}>
                          {p.description || "Active organization project."}
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.8rem", color: "#334155" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748b" }}>Project ID:</span>
                            <strong>#{p.id}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748b" }}>Assigned Role:</span>
                            <strong style={{ color: "#65a30d" }}>{roleLabel}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748b" }}>Manager:</span>
                            <strong>{p.manager?.full_name || "Assigned Manager"}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748b" }}>Status:</span>
                            <strong>{p.status}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748b" }}>Dates:</span>
                            <span>{formatDate(p.start_date)} - {formatDate(p.end_date)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748b" }}>My Tasks:</span>
                            <strong>{myTasksInProj.length} tasks</strong>
                          </div>
                          <div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                              <span style={{ color: "#64748b" }}>Overall Progress:</span>
                              <strong>{p.completion_percent || 0}%</strong>
                            </div>
                            <div style={{ width: "100%", height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: `${p.completion_percent || 0}%`, height: "100%", background: "#65a30d" }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VIEW: MY TASKS */}
          {activeView === "tasks" && (
            <div className="staff-card">
              <div className="staff-card-header">
                <div className="staff-card-title">
                  <FileCheck size={22} /> My Assigned Tasks ({tasks.length})
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      className="profile-input"
                      placeholder="Search tasks..."
                      value={taskSearchQuery}
                      onChange={(e) => setTaskSearchQuery(e.target.value)}
                      style={{ paddingLeft: "2rem", width: 200 }}
                    />
                    <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
                  </div>
                  <select
                    className="profile-select"
                    style={{ width: "auto" }}
                    value={taskFilterStatus}
                    onChange={(e) => setTaskFilterStatus(e.target.value)}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Assigned">Assigned</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Submitted for Review">Submitted for Review</option>
                    <option value="Completed">Completed</option>
                    <option value="Overdue">Overdue Tasks</option>
                  </select>
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={() => setActiveView("dashboard")}
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>

              {/* Task Summary Badges */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: "1.25rem" }}>
                <button
                  type="button"
                  onClick={() => setTaskFilterStatus("All")}
                  className={`detail-tab-btn ${taskFilterStatus === "All" ? "is-active" : ""}`}
                >
                  All Tasks ({tasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilterStatus("Assigned")}
                  className={`detail-tab-btn ${taskFilterStatus === "Assigned" ? "is-active" : ""}`}
                >
                  Pending / Assigned ({pendingTasksCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilterStatus("In Progress")}
                  className={`detail-tab-btn ${taskFilterStatus === "In Progress" ? "is-active" : ""}`}
                >
                  In Progress ({inProgressTasksCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilterStatus("Completed")}
                  className={`detail-tab-btn ${taskFilterStatus === "Completed" ? "is-active" : ""}`}
                >
                  Completed ({completedTasksCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilterStatus("Overdue")}
                  className={`detail-tab-btn ${taskFilterStatus === "Overdue" ? "is-active" : ""}`}
                  style={{ color: overdueTasks.length > 0 ? "#dc2626" : undefined }}
                >
                  Overdue ({overdueTasks.length})
                </button>
              </div>

              {filteredTasksList.length === 0 ? (
                <div className="tasks-empty-state">
                  <CheckCircle2 size={24} />
                  <strong>No tasks match the filter criteria</strong>
                </div>
              ) : (
                <div className="tasks-table-wrapper">
                  <table className="tasks-table">
                    <thead>
                      <tr>
                        <th>Task ID</th>
                        <th>Task Name</th>
                        <th>Project</th>
                        <th>Assigned By</th>
                        <th>Assigned Date</th>
                        <th>Due Date</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Progress</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasksList.map((t) => (
                        <tr key={t.id}>
                          <td>#{t.id}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => handleOpenTaskDetails(t)}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                color: "#0f172a",
                                fontWeight: 750,
                                cursor: "pointer",
                                textAlign: "left",
                                textDecoration: "underline",
                              }}
                            >
                              {t.title}
                            </button>
                          </td>
                          <td>{t.project_name || t.project?.name || "—"}</td>
                          <td>{t.assigned_by?.full_name || "Manager"}</td>
                          <td>{formatDate(t.start_date || t.created_at)}</td>
                          <td>{formatDate(t.due_date)}</td>
                          <td>
                            <span className={`tasks-priority-pill priority-${(t.priority || "Medium").toLowerCase()}`}>
                              {t.priority}
                            </span>
                          </td>
                          <td>
                            <span className={`tasks-status-pill status-${(t.status || "Assigned").toLowerCase().replace(/\s+/g, "-")}`}>
                              {t.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 50, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: `${t.progress}%`, height: "100%", background: "#65a30d" }} />
                              </div>
                              <span style={{ fontSize: "0.78rem", fontWeight: 700 }}>{t.progress}%</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                type="button"
                                className="tasks-row-action"
                                onClick={() => handleOpenTaskDetails(t)}
                                title="View Details"
                              >
                                <Eye size={13} /> View
                              </button>
                              <button
                                type="button"
                                className="tasks-row-action"
                                onClick={() => handleOpenTaskUpdate(t)}
                                title="Update Task"
                              >
                                <Sliders size={13} /> Update
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW: NOTIFICATIONS */}
          {activeView === "notifications" && (
            <div style={{ padding: "0 0 2rem" }}>
              <NotificationsPage />
            </div>
          )}

          {/* VIEW: MY PROFILE */}
          {activeView === "profile" && (
            <div style={{ padding: "0 0 2rem" }}>
              <CompleteProfilePage embedded={true} />
            </div>
          )}
        </main>
      </div>

      {/* MODAL 1: TASK DETAILS MODAL */}
      {activeModal === "task_details" && selectedTask && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          title={`Task Details — #${selectedTask.id} ${selectedTask.title}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="detail-grid-info">
              <div className="detail-info-item">
                <span className="detail-info-label">Project</span>
                <span className="detail-info-val">{selectedTask.project_name || selectedTask.project?.name || "Independent Deliverable"}</span>
              </div>
              <div className="detail-info-item">
                <span className="detail-info-label">Assigned By</span>
                <span className="detail-info-val">{selectedTask.assigned_by?.full_name || "Manager / Lead"}</span>
              </div>
              <div className="detail-info-item">
                <span className="detail-info-label">Start Date</span>
                <span className="detail-info-val">{formatDate(selectedTask.start_date || selectedTask.created_at)}</span>
              </div>
              <div className="detail-info-item">
                <span className="detail-info-label">Due Date</span>
                <span className="detail-info-val">{formatDate(selectedTask.due_date)}</span>
              </div>
              <div className="detail-info-item">
                <span className="detail-info-label">Priority</span>
                <span className={`tasks-priority-pill priority-${(selectedTask.priority || "Medium").toLowerCase()}`}>
                  {selectedTask.priority}
                </span>
              </div>
              <div className="detail-info-item">
                <span className="detail-info-label">Current Status</span>
                <span className={`tasks-status-pill status-${(selectedTask.status || "Assigned").toLowerCase().replace(/\s+/g, "-")}`}>
                  {selectedTask.status} ({selectedTask.progress}%)
                </span>
              </div>
            </div>

            <div>
              <span className="detail-info-label">Description & Requirements</span>
              <p style={{ margin: "6px 0 0", fontSize: "0.88rem", color: "#334155", background: "#f8fafc", padding: "0.85rem", borderRadius: 8, border: "1px solid #e2e8f0", lineHeight: 1.5 }}>
                {selectedTask.description || "No specific instructions provided."}
              </p>
            </div>

            {selectedTask.submission_notes && (
              <div>
                <span className="detail-info-label">Submission Notes</span>
                <p style={{ margin: "6px 0 0", fontSize: "0.88rem", color: "#334155", background: "#f0fdf4", padding: "0.75rem", borderRadius: 8, border: "1px solid #bbf7d0" }}>
                  {selectedTask.submission_notes}
                </p>
              </div>
            )}

            {/* Status History / Activity Timeline */}
            <div>
              <span className="detail-info-label">Status History & Updates</span>
              {Array.isArray(selectedTask.activities) && selectedTask.activities.length > 0 ? (
                <div className="activity-timeline">
                  {selectedTask.activities.map((act) => (
                    <div key={act.id} className="activity-node">
                      <div className="activity-node-meta">
                        <strong>{act.action}</strong>
                        <span>{formatTime(act.created_at)}</span>
                      </div>
                      <div className="activity-node-comment">
                        {act.comment || "Status updated"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#64748b", fontSize: "0.82rem", margin: "6px 0 0" }}>No logged activity records yet.</p>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setActiveModal(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="profile-btn-primary"
                onClick={() => handleOpenTaskUpdate(selectedTask)}
              >
                Update This Task
              </button>
            </div>
          </div>
        </AccessibleModal>
      )}

      {/* MODAL 2: EMPLOYEE TASK UPDATE MODAL */}
      {activeModal === "task_update" && selectedTask && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          title={`Update Task — ${selectedTask.title}`}
        >
          <form onSubmit={handleSaveTaskUpdate} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {modalError && (
              <div className="tasks-alert tasks-alert-error">
                <span>{modalError}</span>
              </div>
            )}

            <div className="daily-form-grid">
              <div>
                <label className="daily-update-label">Status</label>
                <select
                  className="profile-select"
                  value={taskUpdateStatus}
                  onChange={(e) => setTaskUpdateStatus(e.target.value)}
                >
                  <option value="In Progress">In Progress</option>
                  <option value="Submitted for Review">Submit for Review</option>
                  <option value="Completed">Completed</option>
                  <option value="Assigned">Assigned</option>
                </select>
              </div>

              <div>
                <label className="daily-update-label">
                  <span>Progress Percentage</span>
                  <strong>{taskUpdateProgress}%</strong>
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={taskUpdateProgress}
                  onChange={(e) => setTaskUpdateProgress(e.target.value)}
                  style={{ width: "100%", accentColor: "#65a30d" }}
                />
              </div>
            </div>

            <div>
              <label className="daily-update-label">Work Completed Description</label>
              <textarea
                rows={3}
                required
                className="profile-textarea"
                value={taskUpdateDescription}
                onChange={(e) => setTaskUpdateDescription(e.target.value)}
                placeholder="What work was accomplished on this deliverable?"
              />
            </div>

            <div>
              <label className="daily-update-label">Blockers / Issues Encountered</label>
              <input
                type="text"
                className="profile-input"
                placeholder="Any dependencies or roadblocks..."
                value={taskUpdateBlockers}
                onChange={(e) => setTaskUpdateBlockers(e.target.value)}
              />
            </div>

            <div>
              <label className="daily-update-label">GitHub PR / Live Demo URL</label>
              <input
                type="url"
                className="profile-input"
                placeholder="https://github.com/... or preview link"
                value={taskUpdateLiveLink}
                onChange={(e) => setTaskUpdateLiveLink(e.target.value)}
              />
            </div>

            <div>
              <label className="daily-update-label">Completion Remarks</label>
              <input
                type="text"
                className="profile-input"
                placeholder="Notes for supervisor review..."
                value={taskUpdateRemarks}
                onChange={(e) => setTaskUpdateRemarks(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setActiveModal(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={modalLoading}
                className="profile-btn-primary"
              >
                {modalLoading ? "Saving..." : "Save & Log Update"}
              </button>
            </div>
          </form>
        </AccessibleModal>
      )}

      {/* MODAL 3: PROJECT DETAILS MODAL WITH 5 TABS */}
      {activeModal === "project_details" && selectedProject && (
        <AccessibleModal
          isOpen={true}
          onClose={() => setActiveModal(null)}
          title={`Project Details — ${selectedProject.name}`}
        >
          <div>
            {/* 5 Tabs: Overview, My Tasks, Team, Daily Updates, Documents & Links */}
            <div className="detail-modal-tabs">
              <button
                type="button"
                className={`detail-tab-btn ${projectModalTab === "overview" ? "is-active" : ""}`}
                onClick={() => setProjectModalTab("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                className={`detail-tab-btn ${projectModalTab === "tasks" ? "is-active" : ""}`}
                onClick={() => setProjectModalTab("tasks")}
              >
                My Tasks ({projectTasksList.length})
              </button>
              <button
                type="button"
                className={`detail-tab-btn ${projectModalTab === "team" ? "is-active" : ""}`}
                onClick={() => setProjectModalTab("team")}
              >
                Team ({selectedProject.members?.length || 1})
              </button>
              <button
                type="button"
                className={`detail-tab-btn ${projectModalTab === "updates" ? "is-active" : ""}`}
                onClick={() => setProjectModalTab("updates")}
              >
                Daily Updates ({projectDailyUpdates.length})
              </button>
              <button
                type="button"
                className={`detail-tab-btn ${projectModalTab === "links" ? "is-active" : ""}`}
                onClick={() => setProjectModalTab("links")}
              >
                Documents & Links
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {projectModalTab === "overview" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="detail-grid-info">
                  <div className="detail-info-item">
                    <span className="detail-info-label">Project ID</span>
                    <span className="detail-info-val">#{selectedProject.id}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Department</span>
                    <span className="detail-info-val">{selectedProject.department}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Project Manager</span>
                    <span className="detail-info-val">{selectedProject.manager?.full_name || "Manager Assigned"}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Status</span>
                    <span className="detail-info-val">{selectedProject.status}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Start Date</span>
                    <span className="detail-info-val">{formatDate(selectedProject.start_date)}</span>
                  </div>
                  <div className="detail-info-item">
                    <span className="detail-info-label">Due Date</span>
                    <span className="detail-info-val">{formatDate(selectedProject.end_date)}</span>
                  </div>
                </div>

                <div>
                  <span className="detail-info-label">Project Description</span>
                  <p style={{ margin: "6px 0 0", fontSize: "0.88rem", color: "#334155", background: "#f8fafc", padding: "0.85rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    {selectedProject.description || "Project deliverables managed within TaskFlow workspace."}
                  </p>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="detail-info-label">Overall Progress</span>
                    <strong>{selectedProject.completion_percent || 0}%</strong>
                  </div>
                  <div style={{ width: "100%", height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${selectedProject.completion_percent || 0}%`, height: "100%", background: "#65a30d" }} />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: MY TASKS */}
            {projectModalTab === "tasks" && (
              <div>
                {projectTasksList.length === 0 ? (
                  <p style={{ color: "#64748b", margin: "1rem 0" }}>No tasks assigned to you on this project yet.</p>
                ) : (
                  <div className="tasks-table-wrapper">
                    <table className="tasks-table">
                      <thead>
                        <tr>
                          <th>Task Title</th>
                          <th>Due Date</th>
                          <th>Priority</th>
                          <th>Status</th>
                          <th>Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectTasksList.map((tk) => (
                          <tr key={tk.id}>
                            <td><strong>{tk.title}</strong></td>
                            <td>{formatDate(tk.due_date)}</td>
                            <td>
                              <span className={`tasks-priority-pill priority-${(tk.priority || "Medium").toLowerCase()}`}>
                                {tk.priority}
                              </span>
                            </td>
                            <td>
                              <span className={`tasks-status-pill status-${(tk.status || "Assigned").toLowerCase().replace(/\s+/g, "-")}`}>
                                {tk.status}
                              </span>
                            </td>
                            <td>{tk.progress}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TEAM */}
            {projectModalTab === "team" && (
              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "0.88rem", color: "#334155" }}>
                  Project Team Members
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Manager */}
                  {selectedProject.manager && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "0.6rem 0.85rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      <div>
                        <strong>{selectedProject.manager.full_name}</strong>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{selectedProject.manager.email}</div>
                      </div>
                      <span className="daily-badge" style={{ background: "#f0fdf4", color: "#166534" }}>
                        Project Manager
                      </span>
                    </div>
                  )}

                  {/* Members */}
                  {Array.isArray(selectedProject.members) &&
                    selectedProject.members.map((m) => (
                      <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", padding: "0.6rem 0.85rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <div>
                          <strong>{m.full_name}</strong>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{m.email}</div>
                        </div>
                        <span className="daily-badge" style={{ background: "#eff6ff", color: "#1d4ed8" }}>
                          {m.staff_category || m.role || "Team Member"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* TAB 4: DAILY UPDATES */}
            {projectModalTab === "updates" && (
              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "0.88rem", color: "#334155" }}>
                  My Daily Updates for this Project
                </h4>
                {projectDailyUpdates.length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "0.85rem" }}>No daily updates submitted for this project yet.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {projectDailyUpdates.map((u) => (
                      <div key={u.id} className="daily-update-card-item">
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", color: "#64748b" }}>
                          <strong>{u.task?.title || "Project Work"}</strong>
                          <span>{u.update_date}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: "0.84rem", color: "#334155" }}>{u.work_description}</p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: "0.75rem" }}>
                          <span className="daily-badge" style={{ background: "#f0fdf4", color: "#166534" }}>
                            {u.work_status} ({u.progress_percentage}%)
                          </span>
                          {u.live_link && (
                            <a href={u.live_link} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>
                              Live Demo
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: DOCUMENTS & LINKS */}
            {projectModalTab === "links" && (
              <div>
                <h4 style={{ margin: "0 0 10px", fontSize: "0.88rem", color: "#334155" }}>
                  Project Resources & Links
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ background: "#f8fafc", padding: "0.85rem", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.88rem" }}>
                      <LinkIcon size={14} color="#65a30d" /> Project Repository & Docs
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                      Shared repository files and assets for {selectedProject.name}.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setActiveModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </AccessibleModal>
      )}
    </div>
  );
}