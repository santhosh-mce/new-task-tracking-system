import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  Briefcase,
  AlertTriangle,
  FileCheck2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";
import "./NotificationBell.css";

function formatRelativeTime(isoString) {
  if (!isoString) return "—";
  try {
    const diffSeconds = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (diffSeconds < 60) return "Just now";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

function getNotificationIcon(type) {
  switch (type) {
    case "project":
      return <Briefcase size={16} />;
    case "task":
    case "task_status":
      return <ClipboardList size={16} />;
    case "review":
    case "review_approved":
    case "review_changes":
      return <FileCheck2 size={16} />;
    case "attendance":
      return <Clock size={16} />;
    case "deadline_overdue":
    case "deadline_today":
    case "deadline_upcoming":
      return <AlertTriangle size={16} />;
    default:
      return <Sparkles size={16} />;
  }
}

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef(null);

  const notificationsPageLink =
    user?.role === "admin"
      ? "/admin/notifications"
      : user?.role === "manager"
      ? "/manager/notifications"
      : "/notifications";

  // Lightweight unread count poller
  useEffect(() => {
    let cancelled = false;

    async function fetchUnreadCount() {
      try {
        const res = await api.get("/api/notifications/unread-count");
        if (!cancelled && typeof res.data?.unread_count === "number") {
          setUnreadCount(res.data.unread_count);
        }
      } catch (err) {
        // Silent failure for polling
      }
    }

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // 30s poll

    function onFocus() {
      fetchUnreadCount();
    }
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Fetch recent notifications when dropdown opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadDropdownList() {
      setLoading(true);
      try {
        const res = await api.get("/api/notifications", {
          params: { page: 1, page_size: 8 },
        });
        if (!cancelled) {
          setNotifications(Array.isArray(res.data?.items) ? res.data.items : []);
          if (typeof res.data?.unread_count === "number") {
            setUnreadCount(res.data.unread_count);
          }
        }
      } catch (err) {
        console.error("Failed to load notifications:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDropdownList();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Handle click outside & escape key
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function handleMarkAsRead(notif, event) {
    if (event) event.stopPropagation();
    if (notif.is_read) return;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await api.patch(`/api/notifications/${notif.id}/read`);
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  }

  async function handleMarkAllAsRead() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
    try {
      await api.post("/api/notifications/read-all");
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    } finally {
      setMarkingAll(false);
    }
  }

  function handleNotificationClick(notif) {
    handleMarkAsRead(notif);
    setOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  }

  return (
    <div className="notif-bell-container" ref={containerRef}>
      <button
        type="button"
        className="notif-bell-button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown" role="region" aria-label="Notifications Panel">
          <div className="notif-dropdown-header">
            <div className="notif-header-title">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="notif-unread-pill">{unreadCount} new</span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-all-btn"
                onClick={handleMarkAllAsRead}
                disabled={markingAll}
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          <div className="notif-dropdown-list">
            {loading ? (
              <div className="notif-empty-box">
                <p>Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty-box">
                <div className="notif-empty-icon">
                  <Bell size={20} />
                </div>
                <strong>All caught up!</strong>
                <p>You have no recent notifications.</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-item ${notif.is_read ? "is-read" : "is-unread"}`}
                  onClick={() => handleNotificationClick(notif)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleNotificationClick(notif);
                    }
                  }}
                >
                  <div className={`notif-icon-box ${notif.type || "general"}`}>
                    {getNotificationIcon(notif.type)}
                  </div>
                  <div className="notif-content-col">
                    <div className="notif-title-row">
                      <span className="notif-title">{notif.title}</span>
                      <span className="notif-time">
                        {formatRelativeTime(notif.created_at)}
                      </span>
                    </div>
                    <p className="notif-message">{notif.message}</p>
                  </div>
                  {!notif.is_read && (
                    <span
                      className="notif-unread-dot"
                      title="Unread"
                      aria-label="Unread notification"
                    />
                  )}
                </div>
              ))
            )}
          </div>

          <div className="notif-dropdown-footer">
            <Link
              to={notificationsPageLink}
              className="notif-view-all-link"
              onClick={() => setOpen(false)}
            >
              <span>View all notifications</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
