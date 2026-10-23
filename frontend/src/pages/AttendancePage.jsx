import { useEffect, useState, useRef, useMemo } from "react";
import {
  Activity,
  Calendar,
  CalendarCheck2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coffee,
  Download,
  FileCheck2,
  FileEdit,
  Filter,
  History,
  Radio,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Timer,
  UserCheck,
  Users,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import api from "../api.js";
import AccessibleModal from "../components/AccessibleModal.jsx";
import AttendanceWidget from "../components/AttendanceWidget.jsx";
import { useAuth } from "../context/useAuth.js";
import "./Attendance.css";

function formatDateDisplay(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${dateStr}T12:00:00Z`));
  } catch {
    return dateStr;
  }
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

function formatMinutes(mins) {
  if (!mins || mins <= 0) return "0h 00m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function getInitials(name) {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "Present":
      return "badge-present";
    case "Late":
      return "badge-late";
    case "On Break":
      return "badge-break";
    case "Absent":
      return "badge-absent";
    case "On Leave":
      return "badge-leave";
    case "Approved":
      return "badge-approved";
    case "Rejected":
      return "badge-rejected";
    case "Pending":
      return "badge-pending";
    default:
      return "badge-notchecked";
  }
}

function formatLoginTimestamp(isoString) {
  if (!isoString) {
    return {
      display: "—",
      sub: "Never logged in",
      isToday: false,
    };
  }

  try {
    const d = new Date(isoString);
    const now = new Date();

    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    const timeStr = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);

    if (isSameDay(d, now)) {
      return {
        display: `Today, ${timeStr}`,
        sub: "Login time",
        isToday: true,
      };
    } else if (isSameDay(d, yesterday)) {
      return {
        display: `Yesterday, ${timeStr}`,
        sub: "Last session",
        isToday: false,
      };
    } else {
      const dateStr = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d);
      return {
        display: `${dateStr}, ${timeStr}`,
        sub: "Last session",
        isToday: false,
      };
    }
  } catch {
    return {
      display: isoString,
      sub: "Session timestamp",
      isToday: false,
    };
  }
}

function formatSeconds(sec) {
  if (!sec || sec < 0) return "00h 00m 00s";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function getRoleBadge(role) {
  const r = (role || "").toLowerCase();
  switch (r) {
    case "admin":
      return { label: "Admin", className: "role-pill-admin" };
    case "manager":
      return { label: "Manager", className: "role-pill-manager" };
    case "team_lead":
      return { label: "Team Lead", className: "role-pill-lead" };
    case "intern":
      return { label: "Intern", className: "role-pill-intern" };
    default:
      return { label: "Employee", className: "role-pill-employee" };
  }
}

function getLiveSessionDuration(item, nowMs) {
  if (item.current_status === "Never Logged In" || !item.last_login) {
    return "—";
  }
  if (item.current_status === "Online" || item.current_status === "On Break") {
    const elapsedSec = Math.max(0, Math.floor((nowMs - new Date(item.last_login).getTime()) / 1000));
    return formatSeconds(elapsedSec);
  }
  return item.session_duration_seconds ? formatSeconds(item.session_duration_seconds) : "—";
}

function getLiveBreakDuration(item, nowMs) {
  if (item.current_status === "Never Logged In") {
    return "—";
  }
  let totalSec = item.break_duration_seconds || 0;
  if (item.current_status === "On Break" && item.active_break_start) {
    const liveSec = Math.max(0, Math.floor((nowMs - new Date(item.active_break_start).getTime()) / 1000));
    totalSec += liveSec;
  }
  return totalSec > 0 ? formatSeconds(totalSec) : "00h 00m 00s";
}

function getLiveLastActivity(item, nowMs) {
  if (!item.last_activity && !item.last_login) return { text: "—", isRecent: false };
  const actTime = item.last_activity || item.last_login;
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(actTime).getTime()) / 1000));
  if (item.current_status === "Online") {
    if (diffSec < 35) return { text: "Active now", isRecent: true };
    return { text: `${Math.floor(diffSec / 60)}m ago`, isRecent: true };
  }
  if (item.current_status === "On Break") {
    return { text: "On Break", isRecent: false };
  }
  if (diffSec < 60) return { text: "Just now", isRecent: false };
  if (diffSec < 3600) return { text: `${Math.floor(diffSec / 60)}m ago`, isRecent: false };
  if (diffSec < 86400) return { text: `${Math.floor(diffSec / 3600)}h ago`, isRecent: false };
  try {
    return {
      text: new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(actTime)),
      isRecent: false,
    };
  } catch {
    return { text: "—", isRecent: false };
  }
}

function renderStatusBadge(status) {
  switch (status) {
    case "Online":
      return (
        <span className="admin-att-status-pill online">
          <span className="dot pulse" />
          <span>Online</span>
        </span>
      );
    case "On Break":
      return (
        <span className="admin-att-status-pill on-break">
          <Coffee size={12} />
          <span>On Break</span>
        </span>
      );
    case "Offline":
      return (
        <span className="admin-att-status-pill offline">
          <span className="dot" />
          <span>Offline</span>
        </span>
      );
    default:
      return (
        <span className="admin-att-status-pill never-logged-in">
          <span>Never Logged In</span>
        </span>
      );
  }
}

function RealtimeAttendanceView({ user }) {
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateMode, setDateMode] = useState("all"); // 'all', 'today', 'custom'
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [customDate, setCustomDate] = useState(todayStr);
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [wsStatus, setWsStatus] = useState("offline"); // 'connected', 'reconnecting', 'offline'
  const [nowMs, setNowMs] = useState(Date.now());
  const [showMyWidget, setShowMyWidget] = useState(user?.role === "employee" || user?.role === "intern");
  const dateDropdownRef = useRef(null);

  // 1-second interval to tick active durations live
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Dropdown dismiss handler
  useEffect(() => {
    function handleClickOutside(e) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target)) {
        setDateDropdownOpen(false);
      }
    }
    if (dateDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dateDropdownOpen]);

  // WebSocket Connection with auto reconnect and heartbeat
  useEffect(() => {
    let ws = null;
    let pingInterval = null;
    let reconnectTimeout = null;
    let isMounted = true;
    let reconnectAttempts = 0;

    function connectWs() {
      if (!isMounted) return;
      const token = sessionStorage.getItem("access_token");
      if (!token) return;

      const loc = window.location;
      const host = loc.port === "5173" ? `${loc.hostname}:8000` : loc.host;
      const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${host}/api/attendance/ws?token=${encodeURIComponent(token)}`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (!isMounted) return;
          setWsStatus("connected");
          reconnectAttempts = 0;
          // Refresh snapshot on connect to ensure live accuracy
          setRetry((v) => v + 1);

          pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "attendance:update" && msg.data) {
              const updatedItem = msg.data;
              setLogins((prev) => {
                const idx = prev.findIndex((x) => x.user_id === updatedItem.user_id);
                let nextList;
                if (idx >= 0) {
                  nextList = [...prev];
                  nextList[idx] = { ...nextList[idx], ...updatedItem };
                } else {
                  nextList = [updatedItem, ...prev];
                }
                return nextList.sort((a, b) => {
                  if (!a.last_login && !b.last_login) return 0;
                  if (!a.last_login) return 1;
                  if (!b.last_login) return -1;
                  return new Date(b.last_login) - new Date(a.last_login);
                });
              });
            }
          } catch (e) {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setWsStatus("reconnecting");
          if (pingInterval) clearInterval(pingInterval);

          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 16000);
          reconnectAttempts += 1;
          reconnectTimeout = setTimeout(connectWs, delay);
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };
      } catch (err) {
        setWsStatus("offline");
      }
    }

    connectWs();

    return () => {
      isMounted = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  // Fetch authoritatively scoped staff logins
  useEffect(() => {
    let cancelled = false;
    async function loadRecentLogins() {
      setLoading(true);
      setError("");
      try {
        const params = {};
        if (searchQuery.trim()) {
          params.q = searchQuery.trim();
        }
        if (statusFilter && statusFilter !== "All") {
          params.status = statusFilter;
        }
        if (dateMode === "today") {
          params.date = todayStr;
        } else if (dateMode === "custom") {
          params.date = customDate;
        }

        const res = await api.get("/api/attendance/admin/recent-logins", { params });
        if (!cancelled) {
          setLogins(Array.isArray(res.data) ? res.data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.detail || "Failed to load recent login records."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = setTimeout(() => {
      loadRecentLogins();
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, statusFilter, dateMode, customDate, todayStr, retry]);

  const formattedDateStr = (dateStr) => {
    try {
      const d = new Date(`${dateStr}T12:00:00Z`);
      return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const dateButtonLabel = useMemo(() => {
    if (dateMode === "today") {
      const f = formattedDateStr(todayStr);
      return `${f} - ${f}`;
    }
    if (dateMode === "custom") {
      const f = formattedDateStr(customDate);
      return `${f} - ${f}`;
    }
    return "All Dates (Latest first)";
  }, [dateMode, customDate, todayStr]);

  return (
    <div className="attendance-page-container">
      {/* Self-service check-in/break card for Employee / Intern or toggled by Admin/Manager */}
      {(user?.role === "employee" || user?.role === "intern" || showMyWidget) && (
        <div className="att-self-service-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={18} style={{ color: "#65a30d" }} />
              <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>My Daily Attendance & Break Controls</strong>
            </div>
            {(user?.role === "admin" || user?.role === "manager") && (
              <button
                type="button"
                className="taskflow-btn-secondary"
                style={{ fontSize: "0.76rem", padding: "0.25rem 0.6rem" }}
                onClick={() => setShowMyWidget(false)}
              >
                Hide Panel
              </button>
            )}
          </div>
          <AttendanceWidget onActionComplete={() => setRetry((v) => v + 1)} />
        </div>
      )}

      {/* Header and Controls */}
      <header className="admin-att-header">
        <div className="admin-att-title-group">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1>Attendance & Breaks</h1>
            {/* Live WebSocket Connection Pill */}
            {wsStatus === "connected" ? (
              <span className="ws-status-badge connected" title="Connected in real-time via WebSockets">
                <span className="ws-dot" />
                <span>Live</span>
              </span>
            ) : wsStatus === "reconnecting" ? (
              <span className="ws-status-badge reconnecting" title="Reconnecting to real-time attendance service...">
                <span className="ws-dot" />
                <span>Reconnecting...</span>
              </span>
            ) : (
              <span className="ws-status-badge offline" title="Offline mode">
                <span className="ws-dot" />
                <span>Offline</span>
              </span>
            )}
          </div>
          <p>Real-time employee, intern, manager, and admin session tracking</p>
        </div>

        <div className="admin-att-controls">
          {/* Status Filter Dropdown */}
          <select
            className="admin-att-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            title="Filter by current status"
            aria-label="Filter by current status"
          >
            <option value="All">All Statuses</option>
            <option value="Online">Online</option>
            <option value="On Break">On Break</option>
            <option value="Offline">Offline</option>
            <option value="Never Logged In">Never Logged In</option>
          </select>

          {/* Date Filter Dropdown */}
          <div className="admin-att-date-wrapper" ref={dateDropdownRef}>
            <button
              type="button"
              className="admin-att-date-btn"
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              aria-expanded={dateDropdownOpen}
              title="Filter by login date"
            >
              <Calendar size={15} style={{ color: "#64748b" }} />
              <span>{dateButtonLabel}</span>
              <ChevronDown size={14} style={{ color: "#64748b" }} />
            </button>

            {dateDropdownOpen && (
              <div className="admin-att-date-dropdown">
                <button
                  type="button"
                  className={`admin-att-date-option ${dateMode === "all" ? "active" : ""}`}
                  onClick={() => {
                    setDateMode("all");
                    setDateDropdownOpen(false);
                  }}
                >
                  All Dates (Latest first)
                </button>
                <button
                  type="button"
                  className={`admin-att-date-option ${dateMode === "today" ? "active" : ""}`}
                  onClick={() => {
                    setDateMode("today");
                    setDateDropdownOpen(false);
                  }}
                >
                  Today ({formattedDateStr(todayStr)})
                </button>
                <div style={{ padding: "6px 8px 2px", borderTop: "1px solid #f1f5f9", marginTop: 4 }}>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, display: "block", marginBottom: 3 }}>
                    Specific Date:
                  </span>
                  <input
                    type="date"
                    className="admin-att-date-custom-input"
                    value={customDate}
                    onChange={(e) => {
                      setCustomDate(e.target.value);
                      setDateMode("custom");
                      setDateDropdownOpen(false);
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Search Input */}
          <div className="admin-att-search-box">
            <Search size={16} className="admin-att-search-icon" />
            <input
              type="text"
              className="admin-att-search-input"
              placeholder="Search by name, ID or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search by name, ID or department"
            />
            {searchQuery && (
              <button
                type="button"
                className="admin-att-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search query"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Manual Refresh Button */}
          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={() => setRetry((v) => v + 1)}
            title="Refresh attendance records"
            aria-label="Refresh attendance records"
            style={{ padding: "0.5rem 0.75rem" }}
          >
            <RotateCcw size={14} />
          </button>

          {/* Toggle Self-Service Widget for Admin/Manager */}
          {(user?.role === "admin" || user?.role === "manager") && !showMyWidget && (
            <button
              type="button"
              className="taskflow-btn-secondary"
              onClick={() => setShowMyWidget(true)}
              style={{ fontSize: "0.82rem", padding: "0.5rem 0.85rem" }}
            >
              My Check-In
            </button>
          )}
        </div>
      </header>

      {/* Pill: Recent activity · Live sync */}
      <div className="admin-att-tagline">
        <span className="tag-green">Live activity</span>
        <span className="tag-dot">·</span>
        <span className="tag-gray">Newest logins first</span>
        <span className="tag-dot">·</span>
        <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
          {logins.length} {logins.length === 1 ? "staff record" : "staff records"}
        </span>
      </div>

      {/* Error alert */}
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

      {/* 9-Column Real-time Table */}
      <div className="admin-att-card">
        {loading ? (
          <div style={{ padding: "50px 24px", textAlign: "center", color: "#64748b" }}>
            <p style={{ margin: 0, fontWeight: 650, fontSize: "0.92rem" }}>
              Loading real-time attendance records...
            </p>
          </div>
        ) : logins.length === 0 ? (
          <div className="attendance-empty-state">
            <Clock size={36} style={{ color: "#94a3b8", marginBottom: 8 }} />
            <h3>No staff login records found</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
              {searchQuery
                ? `No staff record matches "${searchQuery}".`
                : statusFilter !== "All"
                ? `No staff members currently in "${statusFilter}" status.`
                : dateMode !== "all"
                ? "No logins recorded for the selected date."
                : "No staff accounts found in workspace."}
            </p>
            {(searchQuery || statusFilter !== "All" || dateMode !== "all") && (
              <button
                type="button"
                className="taskflow-btn-secondary"
                style={{ marginTop: 12, fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("All");
                  setDateMode("all");
                }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="admin-att-table-wrapper">
            <table className="admin-att-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Staff ID</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Login Time</th>
                  <th>Current Status</th>
                  <th>Session Duration</th>
                  <th>Break Duration</th>
                  <th>Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {logins.map((item) => {
                  const meta = formatLoginTimestamp(item.last_login);
                  const roleBadge = getRoleBadge(item.role);
                  const sessionDurStr = getLiveSessionDuration(item, nowMs);
                  const breakDurStr = getLiveBreakDuration(item, nowMs);
                  const lastAct = getLiveLastActivity(item, nowMs);
                  const isSessionActive = item.current_status === "Online" || item.current_status === "On Break";
                  const isOnBreak = item.current_status === "On Break";

                  return (
                    <tr key={item.user_id}>
                      {/* 1. Name & Avatar */}
                      <td>
                        <div className="admin-att-user-cell">
                          {item.profile_photo ? (
                            <img
                              src={item.profile_photo}
                              alt={item.full_name}
                              className="admin-att-avatar"
                            />
                          ) : (
                            <div className="admin-att-avatar">
                              {getInitials(item.full_name)}
                            </div>
                          )}
                          <div className="admin-att-user-meta">
                            <strong className="admin-att-user-name">
                              {item.full_name}
                            </strong>
                            <span className="admin-att-user-email">
                              {item.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Staff ID */}
                      <td>
                        <span className="admin-att-staff-id">{item.staff_id || "—"}</span>
                      </td>

                      {/* 3. Role */}
                      <td>
                        <span className={`admin-att-role-pill ${roleBadge.className}`}>
                          {roleBadge.label}
                        </span>
                      </td>

                      {/* 4. Department */}
                      <td>
                        <span className="admin-att-dept">{item.department || "Ingage"}</span>
                      </td>

                      {/* 5. Login Time */}
                      <td>
                        <div className="admin-att-login-cell">
                          <span className="admin-att-login-time">{meta.display}</span>
                          <span
                            className={`admin-att-login-sub ${
                              meta.isToday && isSessionActive ? "green" : ""
                            }`}
                          >
                            <span
                              className={`sub-dot ${
                                meta.isToday && isSessionActive ? "green" : "gray"
                              }`}
                            />
                            <span>{meta.sub}</span>
                          </span>
                        </div>
                      </td>

                      {/* 6. Current Status */}
                      <td>
                        {renderStatusBadge(item.current_status)}
                      </td>

                      {/* 7. Session Duration (Ticking live) */}
                      <td>
                        <span className={`admin-att-duration-cell ${isSessionActive ? "active" : ""}`}>
                          {isSessionActive && <Timer size={12} style={{ color: "#16a34a" }} />}
                          <span>{sessionDurStr}</span>
                        </span>
                      </td>

                      {/* 8. Break Duration (Ticking live when on break) */}
                      <td>
                        <span className={`admin-att-duration-cell ${isOnBreak ? "break-active" : ""}`}>
                          {isOnBreak && <Coffee size={12} style={{ color: "#d97706" }} />}
                          <span>{breakDurStr}</span>
                        </span>
                      </td>

                      {/* 9. Last Activity */}
                      <td>
                        <span className={`admin-att-activity-cell ${lastAct.isRecent ? "recent" : ""}`}>
                          {lastAct.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoricalAttendanceViews() {
  const todayStr = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [activeTab, setActiveTab] = useState("daily"); // 'daily', 'monthly', 'corrections', 'policy'

  // Summary counts
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Daily records table
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  // Monthly report
  const [reportMonth, setReportMonth] = useState(todayStr.slice(0, 7)); // 'YYYY-MM'
  const [monthlyReport, setMonthlyReport] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Corrections
  const [corrections, setCorrections] = useState([]);
  const [correctionsLoading, setCorrectionsLoading] = useState(false);
  const [corrStatusFilter, setCorrStatusFilter] = useState("All");
  const [reviewModalCorr, setReviewModalCorr] = useState(null);
  const [reviewAction, setReviewAction] = useState("approve");
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // Policy Settings (Admin)
  const [policyData, setPolicyData] = useState(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyFeedback, setPolicyFeedback] = useState("");
  const [policyError, setPolicyError] = useState("");

  // Day Details Modal
  const [selectedDayRecord, setSelectedDayRecord] = useState(null);

  // Global alerts & retry
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  // Date Navigation
  function handlePrevDay() {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  }

  function handleNextDay() {
    const d = new Date(`${selectedDate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  }

  // 1. Load Dashboard Summary
  useEffect(() => {
    let cancelled = false;
    async function loadSummary() {
      setSummaryLoading(true);
      try {
        const res = await api.get("/api/attendance/admin/summary", {
          params: { date: selectedDate },
        });
        if (!cancelled) setSummary(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Failed to load attendance summary.");
        }
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    }
    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, retry]);

  // 2. Load Daily Records
  useEffect(() => {
    if (activeTab !== "daily") return;
    let cancelled = false;
    async function loadRecords() {
      setRecordsLoading(true);
      try {
        const res = await api.get("/api/attendance/admin/records", {
          params: {
            date: selectedDate,
            q: searchQuery || undefined,
            department: deptFilter !== "All" ? deptFilter : undefined,
            status: statusFilter !== "All" ? statusFilter : undefined,
          },
        });
        if (!cancelled) setRecords(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Failed to load attendance records.");
        }
      } finally {
        if (!cancelled) setRecordsLoading(false);
      }
    }
    loadRecords();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, searchQuery, deptFilter, statusFilter, activeTab, retry]);

  // 3. Load Monthly Report
  useEffect(() => {
    if (activeTab !== "monthly") return;
    let cancelled = false;
    async function loadReport() {
      setReportLoading(true);
      const [year, month] = reportMonth.split("-").map(Number);
      try {
        const res = await api.get("/api/attendance/admin/monthly-report", {
          params: {
            year,
            month,
            department: deptFilter !== "All" ? deptFilter : undefined,
          },
        });
        if (!cancelled) setMonthlyReport(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Failed to load monthly report.");
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    }
    loadReport();
    return () => {
      cancelled = true;
    };
  }, [reportMonth, deptFilter, activeTab, retry]);

  // 4. Load Corrections
  useEffect(() => {
    if (activeTab !== "corrections") return;
    let cancelled = false;
    async function loadCorrections() {
      setCorrectionsLoading(true);
      try {
        const res = await api.get("/api/attendance/corrections", {
          params: {
            status: corrStatusFilter !== "All" ? corrStatusFilter : undefined,
          },
        });
        if (!cancelled) setCorrections(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Failed to load correction requests.");
        }
      } finally {
        if (!cancelled) setCorrectionsLoading(false);
      }
    }
    loadCorrections();
    return () => {
      cancelled = true;
    };
  }, [corrStatusFilter, activeTab, retry]);

  // 5. Load Policy Settings (Admin only)
  useEffect(() => {
    if (activeTab !== "policy" || !isAdmin) return;
    let cancelled = false;
    async function loadPolicy() {
      try {
        const res = await api.get("/api/attendance/policy");
        if (!cancelled) setPolicyData(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Failed to load attendance policy.");
        }
      }
    }
    loadPolicy();
    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, retry]);

  // Review Correction
  async function handleReviewCorrection(e) {
    e.preventDefault();
    if (!reviewModalCorr) return;
    setReviewLoading(true);
    setReviewError("");

    try {
      await api.patch(`/api/attendance/corrections/${reviewModalCorr.id}`, {
        action: reviewAction,
        reviewer_remarks: reviewRemarks.trim(),
      });
      setReviewModalCorr(null);
      setFeedback(`Correction request ${reviewAction === "approve" ? "approved" : "rejected"} successfully.`);
      setRetry((v) => v + 1);
    } catch (err) {
      setReviewError(err.response?.data?.detail || "Failed to submit review.");
    } finally {
      setReviewLoading(false);
    }
  }

  // Save Policy Settings
  async function handleSavePolicy(e) {
    e.preventDefault();
    setPolicySaving(true);
    setPolicyFeedback("");
    setPolicyError("");

    try {
      const res = await api.put("/api/attendance/policy", {
        shift_start_time: policyData.shift_start_time,
        grace_period_minutes: parseInt(policyData.grace_period_minutes, 10),
        expected_daily_hours: parseFloat(policyData.expected_daily_hours),
        cutoff_time: policyData.cutoff_time,
        deduct_lunch_break: policyData.deduct_lunch_break,
        deduct_tea_break: policyData.deduct_tea_break,
        deduct_personal_break: policyData.deduct_personal_break,
        deduct_short_break: policyData.deduct_short_break,
        max_break_minutes: parseInt(policyData.max_break_minutes, 10),
      });
      setPolicyData(res.data);
      setPolicyFeedback("Attendance policy saved successfully.");
      setRetry((v) => v + 1);
    } catch (err) {
      setPolicyError(err.response?.data?.detail || "Failed to save attendance policy.");
    } finally {
      setPolicySaving(false);
    }
  }

  // Export Monthly Report to CSV
  function handleExportCsv() {
    if (!monthlyReport || monthlyReport.length === 0) return;
    const headers = [
      "Staff Name",
      "Email",
      "Role",
      "Department",
      "Working Days",
      "Present Days",
      "Late Days",
      "Absent Days",
      "Leave Days",
      "Total Net Work Hours",
      "Avg Daily Hours",
    ];

    const rows = monthlyReport.map((r) => [
      `"${r.full_name}"`,
      `"${r.email}"`,
      r.role,
      `"${r.department || 'Not Provided'}"`,
      r.total_working_days,
      r.present_days,
      r.late_days,
      r.absent_days,
      r.leave_days,
      r.total_net_work_hours,
      r.avg_daily_hours,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_report_${reportMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="attendance-page-container">
      {/* Top Header */}
      <header className="attendance-page-header">
        <div className="attendance-title-group">
          <h1>Attendance & Breaks</h1>
          <p>Live session tracking, break management, policy rules, and monthly reports</p>
        </div>

        <div className="attendance-header-actions">
          {/* Scope Tag */}
          <span className="attendance-scope-tag">
            <ShieldCheck size={14} />
            <span>{isAdmin ? "Organization-wide Attendance" : "Authorized Team Attendance"}</span>
          </span>

          {/* Date Navigator */}
          <div className="attendance-date-bar">
            <button
              type="button"
              className="attendance-date-nav-btn"
              onClick={handlePrevDay}
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>

            <input
              type="date"
              className="attendance-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              title="Select attendance date"
            />

            <button
              type="button"
              className="attendance-date-nav-btn"
              onClick={handleNextDay}
              title="Next Day"
            >
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              className={`attendance-quick-today-btn ${selectedDate === todayStr ? "active" : ""}`}
              onClick={() => setSelectedDate(todayStr)}
            >
              Today
            </button>
          </div>
        </div>
      </header>

      {/* Global Alerts */}
      {feedback && (
        <div className="tasks-alert tasks-alert-success" role="status">
          <span>{feedback}</span>
          <button type="button" className="tasks-alert-close" onClick={() => setFeedback("")}>
            <X size={15} />
          </button>
        </div>
      )}

      {error && (
        <div className="tasks-alert tasks-alert-error" role="alert">
          <span>{error}</span>
          <button type="button" className="taskflow-btn-secondary" onClick={() => setRetry((v) => v + 1)}>
            <RotateCcw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Interactive Personal Attendance Controller */}
      <AttendanceWidget onActionComplete={() => setRetry((v) => v + 1)} />

      {/* Summary Stat Cards */}
      <section className="attendance-stat-grid" aria-label="Attendance statistics for selected date">
        <article className="attendance-stat-card stat-staff">
          <div className="attendance-stat-header">
            <span className="attendance-stat-label">Total Staff</span>
            <span className="attendance-stat-icon"><Users size={16} /></span>
          </div>
          <div className="attendance-stat-value">{summaryLoading ? "…" : summary?.total_staff ?? 0}</div>
          <span className="attendance-stat-subtext">Authorized team members</span>
        </article>

        <article className="attendance-stat-card stat-present">
          <div className="attendance-stat-header">
            <span className="attendance-stat-label">Present</span>
            <span className="attendance-stat-icon"><UserCheck size={16} /></span>
          </div>
          <div className="attendance-stat-value" style={{ color: "#16a34a" }}>
            {summaryLoading ? "…" : summary?.present_count ?? 0}
          </div>
          <span className="attendance-stat-subtext">On time check-in</span>
        </article>

        <article className="attendance-stat-card stat-late">
          <div className="attendance-stat-header">
            <span className="attendance-stat-label">Late Arrival</span>
            <span className="attendance-stat-icon"><Clock size={16} /></span>
          </div>
          <div className="attendance-stat-value" style={{ color: "#d97706" }}>
            {summaryLoading ? "…" : summary?.late_count ?? 0}
          </div>
          <span className="attendance-stat-subtext">After grace period</span>
        </article>

        <article className="attendance-stat-card stat-break">
          <div className="attendance-stat-header">
            <span className="attendance-stat-label">On Break</span>
            <span className="attendance-stat-icon"><Coffee size={16} /></span>
          </div>
          <div className="attendance-stat-value" style={{ color: "#4f46e5" }}>
            {summaryLoading ? "…" : summary?.on_break_count ?? 0}
          </div>
          <span className="attendance-stat-subtext">Currently taking break</span>
        </article>

        <article className="attendance-stat-card stat-notchecked">
          <div className="attendance-stat-header">
            <span className="attendance-stat-label">Not Checked In</span>
            <span className="attendance-stat-icon"><Clock size={16} /></span>
          </div>
          <div className="attendance-stat-value">
            {summaryLoading ? "…" : summary?.not_checked_in_count ?? 0}
          </div>
          <span className="attendance-stat-subtext">
            {summary?.cutoff_passed ? "Cutoff reached" : "Before cutoff time"}
          </span>
        </article>

        <article className="attendance-stat-card stat-absent">
          <div className="attendance-stat-header">
            <span className="attendance-stat-label">Absent</span>
            <span className="attendance-stat-icon"><AlertTriangle size={16} /></span>
          </div>
          <div className="attendance-stat-value" style={{ color: "#dc2626" }}>
            {summaryLoading ? "…" : summary?.absent_count ?? 0}
          </div>
          <span className="attendance-stat-subtext">
            {summary?.on_leave_count ? `${summary.on_leave_count} on approved leave` : "No check-in record"}
          </span>
        </article>
      </section>

      {/* Tabs Navigation */}
      <nav className="attendance-tabs-bar" aria-label="Attendance tabs">
        <button
          type="button"
          className={`attendance-tab-btn ${activeTab === "daily" ? "active" : ""}`}
          onClick={() => setActiveTab("daily")}
        >
          <CalendarCheck2 size={16} />
          <span>Daily Records ({formatDateDisplay(selectedDate)})</span>
          <span className="attendance-tab-badge">{records.length}</span>
        </button>

        <button
          type="button"
          className={`attendance-tab-btn ${activeTab === "monthly" ? "active" : ""}`}
          onClick={() => setActiveTab("monthly")}
        >
          <History size={16} />
          <span>Monthly Report</span>
        </button>

        <button
          type="button"
          className={`attendance-tab-btn ${activeTab === "corrections" ? "active" : ""}`}
          onClick={() => setActiveTab("corrections")}
        >
          <FileCheck2 size={16} />
          <span>Correction Requests</span>
          {corrections.filter((c) => c.status === "Pending").length > 0 && (
            <span className="attendance-tab-badge" style={{ background: "#fef3c7", color: "#b45309" }}>
              {corrections.filter((c) => c.status === "Pending").length}
            </span>
          )}
        </button>

        {isAdmin && (
          <button
            type="button"
            className={`attendance-tab-btn ${activeTab === "policy" ? "active" : ""}`}
            onClick={() => setActiveTab("policy")}
          >
            <Settings2 size={16} />
            <span>Shift & Policy Rules</span>
          </button>
        )}
      </nav>

      {/* TAB 1: DAILY RECORDS TABLE */}
      {activeTab === "daily" && (
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Toolbar */}
          <div className="attendance-table-toolbar">
            <div className="attendance-filters-group">
              <div className="attendance-search-input">
                <Search size={15} color="#9ca3af" />
                <input
                  type="text"
                  placeholder="Search staff by name or email…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className="attendance-filter-select"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="All">All Departments</option>
                <option value="Ingage">Ingage</option>
                <option value="Rezov">Rezov</option>
                <option value="Edutech">Edutech</option>
              </select>

              <select
                className="attendance-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="On Break">On Break</option>
                <option value="Not Checked In">Not Checked In</option>
                <option value="Absent">Absent</option>
                <option value="On Leave">On Leave</option>
              </select>
            </div>

            <button
              type="button"
              className="taskflow-btn-secondary"
              onClick={() => setRetry((v) => v + 1)}
              title="Refresh attendance records"
            >
              <RotateCcw size={14} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Table */}
          <div className="attendance-table-card">
            {recordsLoading ? (
              <div className="attendance-empty-state">
                <Clock size={28} className="animate-spin text-lime-600" />
                <p>Loading attendance records for {formatDateDisplay(selectedDate)}…</p>
              </div>
            ) : records.length === 0 ? (
              <div className="attendance-empty-state">
                <h3>No attendance records found</h3>
                <p>Try adjusting your search filters or select another date.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Status</th>
                      <th>First Check-In (IST)</th>
                      <th>Last Check-Out</th>
                      <th>Sessions</th>
                      <th>Total Breaks</th>
                      <th>Net Work Time</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((rec) => (
                      <tr key={rec.user_id}>
                        <td>
                          <div className="attendance-user-cell">
                            <div className="attendance-user-avatar">
                              {getInitials(rec.full_name)}
                            </div>
                            <div>
                              <div className="attendance-user-name">{rec.full_name}</div>
                              <div className="attendance-user-meta">
                                {rec.department || "No dept"} · {rec.role}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className={`attendance-badge ${getStatusBadgeClass(rec.status)}`}>
                            {rec.is_on_break ? (
                              <>
                                <span className="pulsing-break-dot" aria-hidden="true" />
                                On Break ({rec.active_break_type || "Break"})
                              </>
                            ) : rec.is_checked_in ? (
                              <>
                                <span className="pulsing-live-dot" aria-hidden="true" />
                                {rec.status} (Active)
                              </>
                            ) : (
                              rec.status
                            )}
                          </span>
                        </td>

                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatTime(rec.first_check_in)}
                        </td>

                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {rec.is_checked_in ? (
                            <span style={{ color: "#16a34a", fontWeight: 600 }}>Currently Working</span>
                          ) : (
                            formatTime(rec.last_check_out)
                          )}
                        </td>

                        <td>
                          <strong>{rec.sessions_count}</strong> {rec.sessions_count === 1 ? "session" : "sessions"}
                        </td>

                        <td>
                          {formatMinutes(rec.total_break_minutes)}
                        </td>

                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          <strong style={{ color: rec.net_work_minutes >= 480 ? "#16a34a" : "#111827" }}>
                            {formatMinutes(rec.net_work_minutes)}
                          </strong>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="taskflow-btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                            onClick={() => setSelectedDayRecord(rec)}
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: MONTHLY REPORT */}
      {activeTab === "monthly" && (
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Monthly Toolbar */}
          <div className="attendance-table-toolbar">
            <div className="attendance-filters-group">
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", fontWeight: 650 }}>
                Month:
                <input
                  type="month"
                  className="attendance-date-input"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(e.target.value)}
                />
              </label>

              <select
                className="attendance-filter-select"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="All">All Departments</option>
                <option value="Ingage">Ingage</option>
                <option value="Rezov">Rezov</option>
                <option value="Edutech">Edutech</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="taskflow-btn-primary"
                onClick={handleExportCsv}
                disabled={monthlyReport.length === 0}
              >
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Monthly Table */}
          <div className="attendance-table-card">
            {reportLoading ? (
              <div className="attendance-empty-state">
                <Clock size={28} className="animate-spin text-lime-600" />
                <p>Generating monthly attendance report for {reportMonth}…</p>
              </div>
            ) : monthlyReport.length === 0 ? (
              <div className="attendance-empty-state">
                <h3>No report data for {reportMonth}</h3>
                <p>Ensure staff records exist for the selected month.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Department</th>
                      <th>Working Days</th>
                      <th>Present</th>
                      <th>Late</th>
                      <th>Absent</th>
                      <th>Leaves</th>
                      <th>Total Hours</th>
                      <th>Avg Daily Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyReport.map((m) => (
                      <tr key={m.user_id}>
                        <td>
                          <div className="attendance-user-cell">
                            <div className="attendance-user-avatar">
                              {getInitials(m.full_name)}
                            </div>
                            <div>
                              <div className="attendance-user-name">{m.full_name}</div>
                              <div className="attendance-user-meta">{m.email}</div>
                            </div>
                          </div>
                        </td>

                        <td>{m.department || "—"}</td>
                        <td><strong>{m.total_working_days}</strong> days</td>
                        <td style={{ color: "#16a34a", fontWeight: 650 }}>{m.present_days}</td>
                        <td style={{ color: "#d97706", fontWeight: 650 }}>{m.late_days}</td>
                        <td style={{ color: m.absent_days > 0 ? "#dc2626" : "inherit", fontWeight: 650 }}>
                          {m.absent_days}
                        </td>
                        <td>{m.leave_days}</td>
                        <td>
                          <strong>{m.total_net_work_hours} hrs</strong>
                        </td>
                        <td>
                          <span style={{ color: m.avg_daily_hours >= 8.0 ? "#16a34a" : "#374151", fontWeight: 650 }}>
                            {m.avg_daily_hours} hrs/day
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 3: CORRECTION REQUESTS */}
      {activeTab === "corrections" && (
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Toolbar */}
          <div className="attendance-table-toolbar">
            <div className="attendance-filters-group">
              <label style={{ fontSize: "0.85rem", fontWeight: 650 }}>Status:</label>
              <select
                className="attendance-filter-select"
                value={corrStatusFilter}
                onChange={(e) => setCorrStatusFilter(e.target.value)}
              >
                <option value="All">All Requests</option>
                <option value="Pending">Pending Review</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>

            <button
              type="button"
              className="taskflow-btn-secondary"
              onClick={() => setRetry((v) => v + 1)}
            >
              <RotateCcw size={14} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Table */}
          <div className="attendance-table-card">
            {correctionsLoading ? (
              <div className="attendance-empty-state">
                <Clock size={28} className="animate-spin text-lime-600" />
                <p>Loading correction requests…</p>
              </div>
            ) : corrections.length === 0 ? (
              <div className="attendance-empty-state">
                <h3>No correction requests found</h3>
                <p>Staff correction requests will appear here for supervisor review.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Request Date</th>
                      <th>Requested Punch Times</th>
                      <th>Break</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th>Reviewer Remarks</th>
                      {(isAdmin || isManager) && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {corrections.map((corr) => (
                      <tr key={corr.id}>
                        <td>
                          <div className="attendance-user-cell">
                            <div className="attendance-user-avatar">
                              {getInitials(corr.full_name)}
                            </div>
                            <div>
                              <div className="attendance-user-name">{corr.full_name}</div>
                              <div className="attendance-user-meta">{corr.email}</div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <strong>{formatDateDisplay(corr.request_date)}</strong>
                        </td>

                        <td style={{ fontVariantNumeric: "tabular-nums" }}>
                          {formatTime(corr.requested_check_in)} → {formatTime(corr.requested_check_out)}
                        </td>

                        <td>{corr.requested_break_minutes} mins</td>

                        <td style={{ maxWidth: 260 }}>
                          <span style={{ fontSize: "0.82rem", color: "#374151" }}>{corr.reason}</span>
                        </td>

                        <td>
                          <span className={`attendance-badge ${getStatusBadgeClass(corr.status)}`}>
                            {corr.status}
                          </span>
                        </td>

                        <td style={{ maxWidth: 220 }}>
                          {corr.reviewer_remarks ? (
                            <div style={{ fontSize: "0.78rem" }}>
                              <strong>{corr.reviewer_name || "Supervisor"}:</strong> {corr.reviewer_remarks}
                            </div>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>—</span>
                          )}
                        </td>

                        {(isAdmin || isManager) && (
                          <td>
                            {corr.status === "Pending" ? (
                              <button
                                type="button"
                                className="taskflow-btn-primary"
                                style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                                onClick={() => {
                                  setReviewModalCorr(corr);
                                  setReviewAction("approve");
                                  setReviewRemarks("");
                                  setReviewError("");
                                }}
                              >
                                Review
                              </button>
                            ) : (
                              <span style={{ fontSize: "0.76rem", color: "#6b7280" }}>Reviewed</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 4: SHIFT & POLICY RULES (ADMIN) */}
      {activeTab === "policy" && isAdmin && policyData && (
        <form onSubmit={handleSavePolicy} className="attendance-policy-form">
          {policyFeedback && (
            <div className="tasks-alert tasks-alert-success" role="status" style={{ gridColumn: "1 / -1" }}>
              <span>{policyFeedback}</span>
            </div>
          )}

          {policyError && (
            <div className="tasks-alert tasks-alert-error" role="alert" style={{ gridColumn: "1 / -1" }}>
              <span>{policyError}</span>
            </div>
          )}

          <div style={{ gridColumn: "1 / -1", borderBottom: "1px solid #e5e7eb", paddingBottom: 10 }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 4px" }}>
              Organization Attendance & Shift Configuration
            </h2>
            <p style={{ margin: 0, fontSize: "0.84rem", color: "#4b5563" }}>
              Configure expected work hours, grace periods, cutoff limits, and break deduction rules.
            </p>
          </div>

          <div className="task-field">
            <label htmlFor="shift-start">Shift Start Time (IST)</label>
            <input
              id="shift-start"
              type="time"
              required
              value={policyData.shift_start_time}
              onChange={(e) => setPolicyData({ ...policyData, shift_start_time: e.target.value })}
            />
            <small style={{ color: "#6b7280" }}>Official start time of the business work shift</small>
          </div>

          <div className="task-field">
            <label htmlFor="grace-period">Grace Period (Minutes)</label>
            <input
              id="grace-period"
              type="number"
              min="0"
              max="120"
              required
              value={policyData.grace_period_minutes}
              onChange={(e) => setPolicyData({ ...policyData, grace_period_minutes: e.target.value })}
            />
            <small style={{ color: "#6b7280" }}>Check-in after start + grace is marked Late</small>
          </div>

          <div className="task-field">
            <label htmlFor="expected-hours">Expected Daily Hours</label>
            <input
              id="expected-hours"
              type="number"
              step="0.5"
              min="1"
              max="16"
              required
              value={policyData.expected_daily_hours}
              onChange={(e) => setPolicyData({ ...policyData, expected_daily_hours: e.target.value })}
            />
            <small style={{ color: "#6b7280" }}>Standard working hours expected per day (e.g. 8.0)</small>
          </div>

          <div className="task-field">
            <label htmlFor="cutoff-time">Attendance Cutoff Time</label>
            <input
              id="cutoff-time"
              type="time"
              required
              value={policyData.cutoff_time}
              onChange={(e) => setPolicyData({ ...policyData, cutoff_time: e.target.value })}
            />
            <small style={{ color: "#6b7280" }}>Staff with no check-in marked Absent only after cutoff</small>
          </div>

          <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #e5e7eb", paddingTop: 14 }}>
            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 10px" }}>
              Break Deduction Rules
            </h3>

            <div className="attendance-toggle-row">
              <label htmlFor="deduct-lunch">Deduct Lunch Breaks from Working Time</label>
              <input
                id="deduct-lunch"
                type="checkbox"
                checked={policyData.deduct_lunch_break}
                onChange={(e) => setPolicyData({ ...policyData, deduct_lunch_break: e.target.checked })}
              />
            </div>

            <div className="attendance-toggle-row">
              <label htmlFor="deduct-tea">Deduct Tea / Coffee Breaks from Working Time</label>
              <input
                id="deduct-tea"
                type="checkbox"
                checked={policyData.deduct_tea_break}
                onChange={(e) => setPolicyData({ ...policyData, deduct_tea_break: e.target.checked })}
              />
            </div>

            <div className="attendance-toggle-row">
              <label htmlFor="deduct-personal">Deduct Personal Breaks from Working Time</label>
              <input
                id="deduct-personal"
                type="checkbox"
                checked={policyData.deduct_personal_break}
                onChange={(e) => setPolicyData({ ...policyData, deduct_personal_break: e.target.checked })}
              />
            </div>

            <div className="attendance-toggle-row">
              <label htmlFor="deduct-short">Deduct Short Breaks from Working Time</label>
              <input
                id="deduct-short"
                type="checkbox"
                checked={policyData.deduct_short_break}
                onChange={(e) => setPolicyData({ ...policyData, deduct_short_break: e.target.checked })}
              />
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button
              type="submit"
              className="taskflow-btn-primary"
              disabled={policySaving}
              id="save-policy-settings-btn"
            >
              {policySaving ? "Saving Policy…" : "Save Policy Changes"}
            </button>
          </div>
        </form>
      )}

      {/* MODAL: REVIEW CORRECTION REQUEST */}
      {reviewModalCorr && (
        <AccessibleModal
          title={`Review Attendance Correction: ${reviewModalCorr.full_name}`}
          onClose={() => setReviewModalCorr(null)}
        >
          <form onSubmit={handleReviewCorrection} className="task-form">
            {reviewError && (
              <div className="tasks-alert tasks-alert-error" role="alert">
                <span>{reviewError}</span>
              </div>
            )}

            <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: 8, fontSize: "0.85rem" }}>
              <p style={{ margin: "0 0 6px" }}>
                <strong>Staff Member:</strong> {reviewModalCorr.full_name} ({reviewModalCorr.email})
              </p>
              <p style={{ margin: "0 0 6px" }}>
                <strong>Date:</strong> {formatDateDisplay(reviewModalCorr.request_date)}
              </p>
              <p style={{ margin: "0 0 6px" }}>
                <strong>Requested Check-in/out:</strong> {formatTime(reviewModalCorr.requested_check_in)} → {formatTime(reviewModalCorr.requested_check_out)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Reason:</strong> {reviewModalCorr.reason}
              </p>
            </div>

            <div className="task-field">
              <label htmlFor="review-action">Action <span className="required">*</span></label>
              <select
                id="review-action"
                value={reviewAction}
                onChange={(e) => setReviewAction(e.target.value)}
              >
                <option value="approve">Approve Correction</option>
                <option value="reject">Reject Correction</option>
              </select>
            </div>

            <div className="task-field">
              <label htmlFor="review-remarks">Supervisor Remarks <span className="required">*</span></label>
              <textarea
                id="review-remarks"
                required
                rows={3}
                placeholder="Enter audit verification remarks..."
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
              />
            </div>

            <div className="task-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setReviewModalCorr(null)}
                disabled={reviewLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={reviewAction === "approve" ? "taskflow-btn-primary" : "taskflow-btn-danger"}
                disabled={reviewLoading}
                id="confirm-review-correction-btn"
              >
                {reviewLoading ? "Submitting…" : reviewAction === "approve" ? "Confirm Approval" : "Confirm Rejection"}
              </button>
            </div>
          </form>
        </AccessibleModal>
      )}

      {/* MODAL: DAY DETAILS */}
      {selectedDayRecord && (
        <AccessibleModal
          title={`Attendance Details: ${selectedDayRecord.full_name} (${formatDateDisplay(selectedDayRecord.date)})`}
          onClose={() => setSelectedDayRecord(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, background: "#f8fafc", padding: 14, borderRadius: 8 }}>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase" }}>Status</span>
                <div style={{ marginTop: 2 }}>
                  <span className={`attendance-badge ${getStatusBadgeClass(selectedDayRecord.status)}`}>
                    {selectedDayRecord.status}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase" }}>Department</span>
                <div style={{ fontWeight: 650, color: "#111827", marginTop: 2 }}>
                  {selectedDayRecord.department || "Not provided"}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase" }}>First Check-In</span>
                <div style={{ fontWeight: 650, color: "#111827", marginTop: 2 }}>
                  {formatTime(selectedDayRecord.first_check_in)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase" }}>Last Check-Out</span>
                <div style={{ fontWeight: 650, color: "#111827", marginTop: 2 }}>
                  {selectedDayRecord.is_checked_in ? "Currently Working" : formatTime(selectedDayRecord.last_check_out)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase" }}>Net Work Time</span>
                <div style={{ fontWeight: 750, color: "#4d7c0f", fontSize: "1.1rem", marginTop: 2 }}>
                  {formatMinutes(selectedDayRecord.net_work_minutes)}
                </div>
              </div>
              <div>
                <span style={{ fontSize: "0.74rem", color: "#64748b", textTransform: "uppercase" }}>Total Break Time</span>
                <div style={{ fontWeight: 650, color: "#111827", marginTop: 2 }}>
                  {formatMinutes(selectedDayRecord.total_break_minutes)}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setSelectedDayRecord(null)}
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

export default function AttendancePage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState("realtime"); // 'realtime' or 'historical'

  return (
    <div>
      {(user?.role === "admin" || user?.role === "manager") && (
        <div
          style={{
            maxWidth: 1440,
            margin: "18px auto 0",
            padding: "0 32px",
            display: "flex",
            gap: 10,
          }}
        >
          <button
            type="button"
            className={`admin-att-date-option ${viewMode === "realtime" ? "active" : ""}`}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: viewMode === "realtime" ? "1px solid #16a34a" : "1px solid #cbd5e1",
              fontWeight: 700,
              fontSize: "0.84rem",
              background: viewMode === "realtime" ? "#f0fdf4" : "#ffffff",
              color: viewMode === "realtime" ? "#166534" : "#475569",
              cursor: "pointer",
            }}
            onClick={() => setViewMode("realtime")}
          >
            Live Attendance & Breaks
          </button>
          <button
            type="button"
            className={`admin-att-date-option ${viewMode === "historical" ? "active" : ""}`}
            style={{
              padding: "6px 16px",
              borderRadius: 8,
              border: viewMode === "historical" ? "1px solid #16a34a" : "1px solid #cbd5e1",
              fontWeight: 700,
              fontSize: "0.84rem",
              background: viewMode === "historical" ? "#f0fdf4" : "#ffffff",
              color: viewMode === "historical" ? "#166534" : "#475569",
              cursor: "pointer",
            }}
            onClick={() => setViewMode("historical")}
          >
            Historical Logs & Reports
          </button>
        </div>
      )}

      {viewMode === "realtime" ? (
        <RealtimeAttendanceView user={user} />
      ) : (
        <HistoricalAttendanceViews />
      )}
    </div>
  );
}

