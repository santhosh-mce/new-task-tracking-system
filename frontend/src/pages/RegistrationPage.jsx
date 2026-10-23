import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, Clock, Loader2, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import api from "../api.js";
import "./RegistrationPage.css";

function errorMessage(error) {
  const detail = error.response?.data?.detail;
  return typeof detail === "string"
    ? detail
    : "Unable to complete registration. Ask an administrator to send a new invitation.";
}

export default function RegistrationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [validating, setValidating] = useState(Boolean(token));
  const [validationStatus, setValidationStatus] = useState("checking");
  const [validationError, setValidationError] = useState("");
  const [inviteData, setInviteData] = useState({ email: "", role: "" });

  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token) {
      setValidating(false);
      setValidationStatus("missing");
      setValidationError("This registration link is missing its invitation token.");
      return;
    }

    let cancelled = false;
    async function checkToken() {
      setValidating(true);
      setValidationError("");
      try {
        const response = await api.post("/api/auth/invitations/validate", { token });
        if (cancelled) return;
        setInviteData({
          email: response.data.email,
          role: response.data.role,
        });
        setValidationStatus("valid");
      } catch (err) {
        if (cancelled) return;
        const status = err.response?.status;
        const detail = err.response?.data?.detail;
        if (status === 410) {
          setValidationStatus("expired");
          setValidationError(
            detail || "This invitation link has expired. Invitation links expire exactly 5 minutes after they are issued."
          );
        } else if (status === 409) {
          setValidationStatus("used");
          setValidationError(
            detail || "This invitation link has already been used or an account already exists for this email address."
          );
        } else {
          setValidationStatus("invalid");
          setValidationError(
            detail || "This invitation link is invalid or corrupted. Ask an administrator for a new invitation."
          );
        }
      } finally {
        if (!cancelled) {
          setValidating(false);
        }
      }
    }

    checkToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!token) {
      setError("This registration link is missing its invitation token.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters long.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/api/auth/invitations/register", {
        token,
        password,
        password_confirmation: confirmation,
      });
      setPassword("");
      setConfirmation("");
      setCompleted(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  const roleDisplay = inviteData.role
    ? inviteData.role.charAt(0).toUpperCase() + inviteData.role.slice(1)
    : "";

  return (
    <main className="registration-page">
      <section className="registration-card" aria-labelledby="registration-title">
        <Link className="registration-brand" to="/" aria-label="TaskFlow home">
          <span className="registration-brand-mark" aria-hidden="true"><span /></span>
          <span>TaskFlow</span>
        </Link>

        {validating ? (
          <div className="registration-loading-state" role="status">
            <Loader2 className="registration-spinner" size={32} aria-hidden="true" />
            <h1 id="registration-title">Validating invitation</h1>
            <p>Checking security token and invitation validity…</p>
          </div>
        ) : completed ? (
          <div className="registration-result">
            <span className="registration-result-icon"><Check size={23} aria-hidden="true" /></span>
            <p className="registration-eyebrow">Password configured</p>
            <h1 id="registration-title">Password set successfully</h1>
            <p>
              Your password has been securely saved for <strong>{inviteData.email}</strong> with assigned role{" "}
              <strong>{roleDisplay}</strong>. Your account has been initialized with <strong>Profile Incomplete</strong> status.
            </p>
            <p style={{ fontSize: "0.88rem", color: "var(--taskflow-text-muted, #64748b)", marginTop: "0.5rem", marginBottom: "1.25rem" }}>
              Please sign in to complete your required profile details (Personal, Education, Work) and activate full workspace access.
            </p>
            <Link className="registration-primary-link" to="/" state={{ openLogin: true }}>
              Sign in to complete profile
            </Link>
          </div>
        ) : validationStatus === "expired" ? (
          <div className="registration-result registration-state-card">
            <span className="registration-alert-icon status-expired">
              <Clock size={24} aria-hidden="true" />
            </span>
            <p className="registration-eyebrow error-eyebrow">Invitation expired</p>
            <h1 id="registration-title">Link no longer active</h1>
            <p className="registration-state-detail">{validationError}</p>
            <p className="registration-state-hint">
              Security policy requires invitation links to expire after exactly five minutes. Please request a new invitation from your workspace administrator.
            </p>
            <Link className="registration-primary-link secondary-style" to="/">
              Return to Home
            </Link>
          </div>
        ) : validationStatus === "used" ? (
          <div className="registration-result registration-state-card">
            <span className="registration-alert-icon status-used">
              <Lock size={24} aria-hidden="true" />
            </span>
            <p className="registration-eyebrow info-eyebrow">Already registered</p>
            <h1 id="registration-title">Invitation already consumed</h1>
            <p className="registration-state-detail">{validationError}</p>
            <p className="registration-state-hint">
              Each invitation link is single-use. If you have already completed registration, you can proceed directly to sign in.
            </p>
            <Link className="registration-primary-link" to="/" state={{ openLogin: true }}>
              Go to Sign In
            </Link>
          </div>
        ) : validationStatus === "invalid" || validationStatus === "missing" ? (
          <div className="registration-result registration-state-card">
            <span className="registration-alert-icon status-invalid">
              <ShieldAlert size={24} aria-hidden="true" />
            </span>
            <p className="registration-eyebrow error-eyebrow">Invalid invitation</p>
            <h1 id="registration-title">Invalid link</h1>
            <p className="registration-state-detail">{validationError}</p>
            <p className="registration-state-hint">
              Ensure you copied the entire URL from the invitation email. If you need a new link, contact your workspace administrator.
            </p>
            <Link className="registration-primary-link secondary-style" to="/">
              Return to Home
            </Link>
          </div>
        ) : (
          <>
            <span className="registration-shield"><ShieldCheck size={19} aria-hidden="true" /></span>
            <p className="registration-eyebrow">Account invitation</p>
            <h1 id="registration-title">Set your password</h1>
            <p className="registration-description">
              Set a secure password to initialize your account. You will complete your personal and professional profile details upon first sign in.
            </p>

            <form className="registration-form" onSubmit={submit}>
              <div className="registration-readonly-group">
                <label htmlFor="registration-email">Email address</label>
                <input
                  id="registration-email"
                  type="email"
                  readOnly
                  disabled
                  value={inviteData.email}
                  className="registration-input-readonly"
                />
              </div>

              <div className="registration-readonly-group">
                <label htmlFor="registration-role">Assigned role</label>
                <input
                  id="registration-role"
                  type="text"
                  readOnly
                  disabled
                  value={roleDisplay}
                  className="registration-input-readonly"
                />
              </div>

              <label htmlFor="registration-password">New password <span className="required-mark">*</span></label>
              <input
                id="registration-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
                placeholder="At least 12 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <small className="registration-hint">Use at least 12 characters with a mix of letters, numbers, and symbols.</small>

              <label htmlFor="registration-confirmation">Confirm password <span className="required-mark">*</span></label>
              <input
                id="registration-confirmation"
                name="password_confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={256}
                required
                placeholder="Re-enter your password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />

              {error && <p className="registration-error" role="alert">{error}</p>}

              <button className="registration-submit" type="submit" disabled={submitting || !token}>
                {submitting ? "Setting password…" : "Set Password"}
              </button>
            </form>
            <p className="registration-expiry-note">
              Single-use invitation link expires in five minutes. Passwords are encrypted and never stored in plaintext.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
