import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Briefcase,
  Check,
  CheckCheck,
  ClipboardList,
  Clock,
  FileCheck2,
  Filter,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";
import "./NotificationsPage.css";

function formatFullTime(isoString) {
  if (!isoString) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function getNotificationIcon(type) {
  switch (type) {
    case "project":
      return <Briefcase size={20} />;
    case "task":
    case "task_status":
      return <ClipboardList size={20} />;
    case "review":
    case "review_approved":
    case "review_changes":
      return <FileCheck2 size={20} />;
    case "attendance":
      return <Clock size={20} />;
    case "deadline_overdue":
    case "deadline_today":
    case "deadline_upcoming":
      return <AlertTriangle size={20} />;
    default:
      return <Sparkles size={20} />;
  }
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all"); // 'all', 'unread', 'read'
  const [typeFilter, setTypeFilter] = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);
  const [page, setPage] = useState(1);

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const params = {
        filter,
        page,
        page_size: 50,
      };
      if (typeFilter !== "all") {
        params.type = typeFilter;
      }
      const res = await api.get("/api/notifications", { params });
      setNotifications(Array.isArray(res.data?.items) ? res.data.items : []);
      setTotalCount(res.data?.total || 0);
      setUnreadCount(res.data?.unread_count || 0);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, [filter, typeFilter, page]);

  async function handleMarkSingleRead(notifId) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.patch(`/api/notifications/${notifId}/read`);
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  }

  async function handleMarkAllRead() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await api.post("/api/notifications/read-all");
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleDeleteNotification(notifId) {
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    setTotalCount((prev) => Math.max(0, prev - 1));
    try {
      await api.delete(`/api/notifications/${notifId}`);
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  }

  function handleNavigate(notif) {
    if (!notif.is_read) {
      handleMarkSingleRead(notif.id);
    }
    if (notif.link) {
      const isStaff = user?.role === "employee" || user?.role === "intern";
      let dest = notif.link;
      if (isStaff) {
        if (dest === "/tasks" || dest === "/my-tasks" || dest.startsWith("/tasks/")) {
          dest = "/dashboard?view=tasks";
        } else if (dest === "/projects" || dest.startsWith("/projects/")) {
          dest = "/dashboard?view=projects";
        } else if (dest === "/notifications") {
          dest = "/dashboard?view=notifications";
        } else if (dest === "/profile") {
          dest = "/dashboard?view=profile";
        }
      }
      navigate(dest);
    }
  }

  return (
    <div className="notif-page-container">
      {/* Header */}
      <div className="notif-page-header">
        <div className="notif-page-header-text">
          <h1>
            <Bell size={24} style={{ color: "#65a30d" }} />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="notif-unread-pill">{unreadCount} unread</span>
            )}
          </h1>
          <p>
            Stay updated on project assignments, task updates, reviews, and attendance corrections.
          </p>
        </div>

        <div className="notif-page-header-actions">
          <button
            type="button"
            className="notif-page-btn"
            onClick={loadNotifications}
            disabled={loading}
            title="Refresh notifications"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              className="notif-page-btn notif-page-btn-primary"
              onClick={handleMarkAllRead}
              disabled={markingAll}
            >
              <CheckCheck size={16} />
              <span>Mark All as Read</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="notif-filters-bar">
        <div className="notif-filter-tabs">
          <button
            type="button"
            className={`notif-filter-tab ${filter === "all" ? "active" : ""}`}
            onClick={() => {
              setPage(1);
              setFilter("all");
            }}
          >
            <span>All</span>
            <span className="notif-tab-count">{totalCount}</span>
          </button>
          <button
            type="button"
            className={`notif-filter-tab ${filter === "unread" ? "active" : ""}`}
            onClick={() => {
              setPage(1);
              setFilter("unread");
            }}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="notif-tab-count">{unreadCount}</span>
            )}
          </button>
          <button
            type="button"
            className={`notif-filter-tab ${filter === "read" ? "active" : ""}`}
            onClick={() => {
              setPage(1);
              setFilter("read");
            }}
          >
            <span>Read</span>
          </button>
        </div>

        <select
          className="notif-type-select"
          value={typeFilter}
          onChange={(e) => {
            setPage(1);
            setTypeFilter(e.target.value);
          }}
          aria-label="Filter notifications by category"
        >
          <option value="all">All Categories</option>
          <option value="task">Tasks</option>
          <option value="task_status">Task Status</option>
          <option value="project">Projects</option>
          <option value="review">Reviews</option>
          <option value="attendance">Attendance</option>
          <option value="deadline_overdue">Overdue Deadlines</option>
          <option value="deadline_today">Due Today</option>
          <option value="deadline_upcoming">Approaching Deadlines</option>
        </select>
      </div>

      {/* List / Empty States */}
      {loading ? (
        <div className="notif-state-card">
          <p>Loading your notifications...</p>
        </div>
      ) : error ? (
        <div className="notif-state-card">
          <AlertTriangle size={32} style={{ color: "#ef4444", marginBottom: 12 }} />
          <h3>Unable to load notifications</h3>
          <p>{error}</p>
          <button
            type="button"
            className="notif-page-btn"
            onClick={loadNotifications}
            style={{ marginTop: 16 }}
          >
            Try Again
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="notif-state-card">
          <div className="notif-state-icon">
            <Bell size={28} />
          </div>
          <h3>
            {filter === "unread"
              ? "No unread notifications"
              : "No notifications found"}
          </h3>
          <p>
            {filter === "unread"
              ? "You are all caught up with your latest updates and assignments."
              : "When events occur in your projects and tasks, you will see notifications here."}
          </p>
        </div>
      ) : (
        <div className="notif-page-list">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`notif-card ${notif.is_read ? "is-read" : "is-unread"}`}
            >
              <div className={`notif-card-icon notif-icon-box ${notif.type || "general"}`}>
                {getNotificationIcon(notif.type)}
              </div>

              <div className="notif-card-main">
                <div className="notif-card-top-row">
                  <span className="notif-card-title">{notif.title}</span>
                  <span className="notif-card-time">
                    {formatFullTime(notif.created_at)}
                  </span>
                </div>

                <p className="notif-card-message">{notif.message}</p>

                <div className="notif-card-actions">
                  {notif.link && (
                    <button
                      type="button"
                      className="notif-action-link"
                      onClick={() => handleNavigate(notif)}
                    >
                      <span>Open Related Page</span>
                      <ArrowRight size={13} />
                    </button>
                  )}

                  {!notif.is_read && (
                    <button
                      type="button"
                      className="notif-action-btn-secondary"
                      onClick={() => handleMarkSingleRead(notif.id)}
                    >
                      <Check size={14} style={{ color: "#65a30d" }} />
                      <span>Mark as read</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="notif-action-btn-secondary"
                    onClick={() => handleDeleteNotification(notif.id)}
                    title="Dismiss notification"
                  >
                    <Trash2 size={13} style={{ color: "#94a3b8" }} />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
