import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock, LogOut } from "lucide-react";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";
import "./ChangePasswordPage.css";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, authenticate, clearAuth } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword) {
      setError("Please enter your current temporary password.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password cannot be the same as your temporary password.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await api.post("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });

      const token = response.data.access_token;
      if (token) {
        sessionStorage.setItem("access_token", token);
      }

      // Re-fetch current user data to update AuthContext
      const freshMe = await api.get("/api/auth/me");
      authenticate(freshMe.data);

      setSuccess("Password updated successfully! Redirecting to profile setup...");

      setTimeout(() => {
        if (freshMe.data.onboarding_status === "pending" || freshMe.data.profile_status === "incomplete") {
          navigate("/complete-profile", { replace: true });
        } else {
          const dest = freshMe.data.role === "admin"
            ? "/admin"
            : freshMe.data.role === "manager"
            ? "/manager"
            : "/dashboard";
          navigate(dest, { replace: true });
        }
      }, 1200);
    } catch (err) {
      setError(
        err.response?.data?.detail || "Unable to change password. Please check your temporary password."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    clearAuth();
    navigate("/", { replace: true });
  }

  return (
    <div className="change-password-page">
      <header className="change-password-header">
        <div className="change-password-brand">
          <span className="change-password-brand-icon">T</span>
          <span className="change-password-brand-name">TaskFlow Workspace</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Signed in as <strong>{user?.email}</strong>
          </span>
          <button
            type="button"
            className="secondary-button"
            onClick={handleLogout}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.82rem", padding: "0.35rem 0.75rem" }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <main className="change-password-container">
        <div className="change-password-card">
          <div className="change-password-badge-wrap">
            <span className="change-password-badge">
              <KeyRound size={14} /> First-Login Security Step
            </span>
          </div>

          <h1 className="change-password-title">Change Temporary Password</h1>
          <p className="change-password-subtitle">
            Welcome to Ingage TaskFlow. For your security, please replace your temporary password with a strong personal password before proceeding.
          </p>

          {error && (
            <div className="change-password-error" role="alert" style={{ marginBottom: 16 }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="change-password-success" role="status" style={{ marginBottom: 16 }}>
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          <form className="change-password-form" onSubmit={handleSubmit}>
            <label>
              Current temporary password
              <div className="input-password-wrapper">
                <input
                  type={showCurrent ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="Enter temporary password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowCurrent(!showCurrent)}
                  title={showCurrent ? "Hide password" : "Show password"}
                  aria-label={showCurrent ? "Hide password" : "Show password"}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label>
              New password
              <div className="input-password-wrapper">
                <input
                  type={showNew ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Enter new password (min. 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowNew(!showNew)}
                  title={showNew ? "Hide password" : "Show password"}
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Must be at least 8 characters long and different from temporary password.
              </span>
            </label>

            <label>
              Confirm new password
              <div className="input-password-wrapper">
                <input
                  type={showConfirm ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirm(!showConfirm)}
                  title={showConfirm ? "Hide password" : "Show password"}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <button
              type="submit"
              className="change-password-submit-btn"
              disabled={submitting}
            >
              <Lock size={16} />
              {submitting ? "Updating Password..." : "Update Password & Continue"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
