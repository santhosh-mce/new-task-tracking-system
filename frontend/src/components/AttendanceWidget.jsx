import { useEffect, useState, useRef } from "react";
import {
  Clock,
  Coffee,
  Play,
  Square,
  Utensils,
  AlertCircle,
  FileEdit,
  CheckCircle2,
  X,
  History,
  Timer,
  UserCheck,
} from "lucide-react";
import api from "../api.js";
import AccessibleModal from "./AccessibleModal.jsx";
import "../pages/Attendance.css";

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
      second: "2-digit",
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export default function AttendanceWidget({ onActionComplete, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [now, setNow] = useState(new Date());

  // Modals
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [selectedBreakType, setSelectedBreakType] = useState("Lunch");
  const [breakReason, setBreakReason] = useState("");

  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [correctionDate, setCorrectionDate] = useState("");
  const [correctionCheckIn, setCorrectionCheckIn] = useState("");
  const [correctionCheckOut, setCorrectionCheckOut] = useState("");
  const [correctionBreakMins, setCorrectionBreakMins] = useState(0);
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctionError, setCorrectionError] = useState("");
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

  // Live ticking clock & drift calculation
  const serverOffsetRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date(Date.now() + serverOffsetRef.current));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  async function fetchTodayStatus() {
    try {
      const res = await api.get("/api/attendance/today");
      setData(res.data);
      if (res.data.server_time) {
        const serverMs = new Date(res.data.server_time).getTime();
        serverOffsetRef.current = serverMs - Date.now();
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to load today's attendance status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTodayStatus();
  }, []);

  // Action Handlers
  async function handleCheckIn() {
    setActionLoading(true);
    setError("");
    try {
      const res = await api.post("/api/attendance/check-in", { source: "manual" });
      setData(res.data);
      setFeedback("Checked in successfully! Have a productive day.");
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setError(err.response?.data?.detail || "Check in failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut() {
    if (!window.confirm("Are you sure you want to check out for this session?")) return;
    setActionLoading(true);
    setError("");
    try {
      const res = await api.post("/api/attendance/check-out");
      setData(res.data);
      setFeedback("Checked out successfully.");
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setError(err.response?.data?.detail || "Check out failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleStartBreak(e) {
    e.preventDefault();
    setActionLoading(true);
    setError("");
    try {
      await api.post("/api/attendance/break/start", {
        break_type: selectedBreakType,
        reason: breakReason.trim() || null,
      });
      setShowBreakModal(false);
      setBreakReason("");
      setFeedback(`Enjoy your ${selectedBreakType}! Break timer started.`);
      await fetchTodayStatus();
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to start break.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEndBreak() {
    setActionLoading(true);
    setError("");
    try {
      const res = await api.post("/api/attendance/break/end");
      setData(res.data);
      setFeedback("Break ended. Welcome back!");
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to end break.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitCorrection(e) {
    e.preventDefault();
    setCorrectionError("");

    if (!correctionDate || !correctionCheckIn || !correctionCheckOut) {
      setCorrectionError("Please provide date, check-in time and check-out time.");
      return;
    }

    const inIso = `${correctionDate}T${correctionCheckIn}:00Z`;
    const outIso = `${correctionDate}T${correctionCheckOut}:00Z`;

    if (new Date(outIso) <= new Date(inIso)) {
      setCorrectionError("Check-out time must be later than check-in time.");
      return;
    }

    setCorrectionSubmitting(true);
    try {
      await api.post("/api/attendance/corrections", {
        request_date: correctionDate,
        requested_check_in: inIso,
        requested_check_out: outIso,
        requested_break_minutes: parseInt(correctionBreakMins, 10) || 0,
        reason: correctionReason.trim(),
      });
      setShowCorrectionModal(false);
      setFeedback("Attendance correction request submitted for supervisor approval.");
      setCorrectionDate("");
      setCorrectionCheckIn("");
      setCorrectionCheckOut("");
      setCorrectionReason("");
    } catch (err) {
      setCorrectionError(err.response?.data?.detail || "Failed to submit correction request.");
    } finally {
      setCorrectionSubmitting(false);
    }
  }

  // Calculate live ticking seconds
  let liveSessionSecs = 0;
  if (data?.is_checked_in && data.active_session_start) {
    liveSessionSecs = Math.max(0, Math.floor((now.getTime() - new Date(data.active_session_start).getTime()) / 1000));
  }

  let liveBreakSecs = 0;
  if (data?.is_on_break && data.active_break_start) {
    liveBreakSecs = Math.max(0, Math.floor((now.getTime() - new Date(data.active_break_start).getTime()) / 1000));
  }

  // Live total net minutes
  const baseNetMins = data?.net_work_minutes || 0;
  const liveNetMins = data?.is_checked_in ? Math.max(0, Math.floor(liveSessionSecs / 60)) : 0;
  const displayNetMins = data?.is_checked_in ? baseNetMins : (data?.net_work_minutes || 0);

  const digitalTimeString = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);

  return (
    <article className="attendance-widget-card" id="attendance-live-widget">
      {/* Global Alerts */}
      {feedback && (
        <div className="tasks-alert tasks-alert-success" role="status" style={{ margin: 0 }}>
          <span>{feedback}</span>
          <button type="button" className="tasks-alert-close" onClick={() => setFeedback("")}>
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="tasks-alert tasks-alert-error" role="alert" style={{ margin: 0 }}>
          <span>{error}</span>
          <button type="button" className="tasks-alert-close" onClick={() => setError("")}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header with Live Status & Clock */}
      <div className="attendance-widget-header">
        <div className="attendance-widget-status-group">
          <div className="attendance-clock-display" title="Live IST Working Time">
            {digitalTimeString}
          </div>

          {loading ? (
            <span className="attendance-badge badge-notchecked">Syncing…</span>
          ) : data?.is_on_break ? (
            <span className="attendance-badge badge-break">
              <span className="pulsing-break-dot" aria-hidden="true" />
              On Break ({data.active_break_type || "Break"})
            </span>
          ) : data?.is_checked_in ? (
            <span className="attendance-badge badge-present">
              <span className="pulsing-live-dot" aria-hidden="true" />
              Active Session ({data.status})
            </span>
          ) : (
            <span className="attendance-badge badge-notchecked">
              {data?.status === "Not Checked In" ? "Not Checked In" : `Checked Out (${data?.status || "Off"})`}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="attendance-widget-actions">
          {!data?.is_checked_in ? (
            <button
              type="button"
              className="taskflow-btn-primary btn-check-in"
              onClick={handleCheckIn}
              disabled={actionLoading}
              id="attendance-check-in-btn"
            >
              <Play size={15} fill="currentColor" />
              <span>Check In</span>
            </button>
          ) : (
            <>
              {data?.is_on_break ? (
                <button
                  type="button"
                  className="taskflow-btn-primary btn-break-end"
                  onClick={handleEndBreak}
                  disabled={actionLoading}
                  id="attendance-end-break-btn"
                >
                  <Play size={15} fill="currentColor" />
                  <span>End Break</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="taskflow-btn-primary btn-break-start"
                  onClick={() => setShowBreakModal(true)}
                  disabled={actionLoading}
                  id="attendance-start-break-btn"
                >
                  <Coffee size={15} />
                  <span>Take Break</span>
                </button>
              )}

              <button
                type="button"
                className="taskflow-btn-danger btn-check-out"
                onClick={handleCheckOut}
                disabled={actionLoading}
                id="attendance-check-out-btn"
              >
                <Square size={14} fill="currentColor" />
                <span>Check Out</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="taskflow-btn-secondary"
            onClick={() => {
              const todayStr = new Date().toISOString().split("T")[0];
              setCorrectionDate(todayStr);
              setCorrectionError("");
              setShowCorrectionModal(true);
            }}
            title="Request attendance correction for missed punches"
            id="attendance-correction-modal-btn"
          >
            <FileEdit size={14} />
            <span>Correction</span>
          </button>
        </div>
      </div>

      {/* Counters & Live Timers */}
      <div className="attendance-widget-timers">
        <div className="attendance-widget-timer-item">
          <span className="attendance-timer-label">Today's Net Work</span>
          <span className="attendance-timer-val highlight">
            {formatMinutes(displayNetMins)}
          </span>
        </div>

        {data?.is_checked_in && (
          <div className="attendance-widget-timer-item">
            <span className="attendance-timer-label">Active Session</span>
            <span className="attendance-timer-val">
              {Math.floor(liveSessionSecs / 3600)}h {String(Math.floor((liveSessionSecs % 3600) / 60)).padStart(2, "0")}m {String(liveSessionSecs % 60).padStart(2, "0")}s
            </span>
          </div>
        )}

        {data?.is_on_break && (
          <div className="attendance-widget-timer-item">
            <span className="attendance-timer-label">Current Break</span>
            <span className="attendance-timer-val" style={{ color: "#8b5cf6" }}>
              {Math.floor(liveBreakSecs / 60)}m {String(liveBreakSecs % 60).padStart(2, "0")}s
            </span>
          </div>
        )}

        <div className="attendance-widget-timer-item">
          <span className="attendance-timer-label">Total Break Taken</span>
          <span className="attendance-timer-val">
            {formatMinutes(data?.total_break_minutes || 0)}
          </span>
        </div>

        <div className="attendance-widget-timer-item">
          <span className="attendance-timer-label">First Check-In</span>
          <span className="attendance-timer-val" style={{ fontSize: "0.95rem" }}>
            {formatTime(data?.first_check_in)}
          </span>
        </div>
      </div>

      {/* Today's Activity Timeline / Session Chips */}
      {!compact && data?.sessions?.length > 0 && (
        <div className="attendance-activity-timeline">
          <span className="attendance-timeline-title">Today's Sessions & Breaks</span>
          <div className="attendance-timeline-list">
            {data.sessions.map((sess, idx) => (
              <span key={sess.id} className="attendance-timeline-chip" title={`Session #${idx + 1}`}>
                <Timer size={12} />
                <span>
                  {formatTime(sess.check_in)} → {sess.check_out ? formatTime(sess.check_out) : "Active"}
                </span>
                {sess.duration_minutes !== null && (
                  <strong>({sess.duration_minutes}m)</strong>
                )}
              </span>
            ))}

            {data.breaks.map((b) => (
              <span
                key={b.id}
                className="attendance-timeline-chip"
                style={{ background: "#f5f3ff", color: "#6d28d9" }}
                title={`${b.break_type} Break`}
              >
                <Coffee size={12} />
                <span>
                  {b.break_type}: {formatTime(b.start_time)} → {b.end_time ? formatTime(b.end_time) : "Active"}
                </span>
                {b.duration_minutes !== null && (
                  <strong>({b.duration_minutes}m)</strong>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: TAKE A BREAK */}
      {showBreakModal && (
        <AccessibleModal title="Start a Break" onClose={() => setShowBreakModal(false)}>
          <form onSubmit={handleStartBreak} className="task-form">
            <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "#4b5563" }}>
              Select the type of break you are taking. Your live work timer will pause accordingly.
            </p>

            <div className="break-type-grid">
              <button
                type="button"
                className={`break-type-btn ${selectedBreakType === "Lunch" ? "selected" : ""}`}
                onClick={() => setSelectedBreakType("Lunch")}
              >
                <span className="break-type-icon">🍔</span>
                <span className="break-type-title">Lunch Break</span>
                <span className="break-type-policy">(Policy: Deducted)</span>
              </button>

              <button
                type="button"
                className={`break-type-btn ${selectedBreakType === "Tea" ? "selected" : ""}`}
                onClick={() => setSelectedBreakType("Tea")}
              >
                <span className="break-type-icon">☕</span>
                <span className="break-type-title">Tea / Coffee</span>
                <span className="break-type-policy">(Policy: Paid)</span>
              </button>

              <button
                type="button"
                className={`break-type-btn ${selectedBreakType === "Short Break" ? "selected" : ""}`}
                onClick={() => setSelectedBreakType("Short Break")}
              >
                <span className="break-type-icon">🚻</span>
                <span className="break-type-title">Short Break</span>
                <span className="break-type-policy">(Policy: Paid)</span>
              </button>

              <button
                type="button"
                className={`break-type-btn ${selectedBreakType === "Personal" ? "selected" : ""}`}
                onClick={() => setSelectedBreakType("Personal")}
              >
                <span className="break-type-icon">👤</span>
                <span className="break-type-title">Personal</span>
                <span className="break-type-policy">(Policy: Deducted)</span>
              </button>
            </div>

            <div className="task-field">
              <label htmlFor="break-reason">Optional Reason / Notes</label>
              <input
                id="break-reason"
                type="text"
                placeholder="e.g. Lunch with team or quick errand"
                value={breakReason}
                onChange={(e) => setBreakReason(e.target.value)}
              />
            </div>

            <div className="task-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setShowBreakModal(false)}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="taskflow-btn-primary"
                disabled={actionLoading}
                id="confirm-start-break-btn"
              >
                {actionLoading ? "Starting..." : "Start Break"}
              </button>
            </div>
          </form>
        </AccessibleModal>
      )}

      {/* MODAL: ATTENDANCE CORRECTION REQUEST */}
      {showCorrectionModal && (
        <AccessibleModal title="Request Attendance Correction" onClose={() => setShowCorrectionModal(false)}>
          <form onSubmit={handleSubmitCorrection} className="task-form" noValidate>
            {correctionError && (
              <div className="tasks-alert tasks-alert-error" role="alert">
                <span>{correctionError}</span>
              </div>
            )}

            <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "#4b5563" }}>
              Submit an attendance correction if you forgot to check in/out or encountered system issues. Your supervisor will review and approve.
            </p>

            <div className="task-field">
              <label htmlFor="correction-date">Date <span className="required">*</span></label>
              <input
                id="correction-date"
                type="date"
                required
                value={correctionDate}
                onChange={(e) => setCorrectionDate(e.target.value)}
              />
            </div>

            <div className="task-field-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="task-field">
                <label htmlFor="correction-check-in">Check-in Time (24h) <span className="required">*</span></label>
                <input
                  id="correction-check-in"
                  type="time"
                  required
                  value={correctionCheckIn}
                  onChange={(e) => setCorrectionCheckIn(e.target.value)}
                />
              </div>

              <div className="task-field">
                <label htmlFor="correction-check-out">Check-out Time (24h) <span className="required">*</span></label>
                <input
                  id="correction-check-out"
                  type="time"
                  required
                  value={correctionCheckOut}
                  onChange={(e) => setCorrectionCheckOut(e.target.value)}
                />
              </div>
            </div>

            <div className="task-field">
              <label htmlFor="correction-break">Estimated Break Minutes</label>
              <input
                id="correction-break"
                type="number"
                min="0"
                max="360"
                value={correctionBreakMins}
                onChange={(e) => setCorrectionBreakMins(e.target.value)}
              />
            </div>

            <div className="task-field">
              <label htmlFor="correction-reason">Reason for Correction <span className="required">*</span></label>
              <textarea
                id="correction-reason"
                required
                rows={3}
                placeholder="Explain why correction is requested (e.g. system downtime, field visit)..."
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
              />
            </div>

            <div className="task-form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className="taskflow-btn-secondary"
                onClick={() => setShowCorrectionModal(false)}
                disabled={correctionSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="taskflow-btn-primary"
                disabled={correctionSubmitting}
                id="submit-correction-request-btn"
              >
                {correctionSubmitting ? "Submitting..." : "Submit Correction Request"}
              </button>
            </div>
          </form>
        </AccessibleModal>
      )}
    </article>
  );
}
