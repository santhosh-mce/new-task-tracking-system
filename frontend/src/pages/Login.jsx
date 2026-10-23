import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";
import "./Login.css";

export default function Login({ onClose }) {
  const navigate = useNavigate();
  const { authenticate, clearAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(loading);
  const dialogRef = useRef(null);
  const emailRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    emailRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!loadingRef.current) onClose();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [onClose]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    loadingRef.current = true;
    setLoading(true);
    let tokenStored = false;

    try {
      const response = await api.post("/api/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      const token = response.data.access_token;

      if (!token || !response.data.role) {
        setError("Login could not be completed. Please try again.");
        return;
      }

      sessionStorage.setItem("access_token", token);
      sessionStorage.setItem("role", response.data.role);
      tokenStored = true;

      const profile = await api.get("/api/auth/me");
      sessionStorage.setItem("role", profile.data.role);
      authenticate(profile.data);
      onClose();

      const dest = profile.data.role === "admin"
        ? "/admin"
        : profile.data.role === "manager"
        ? "/manager"
        : "/dashboard";
      navigate(dest, { replace: true });
    } catch (requestError) {
      if (tokenStored) clearAuth();
      setError(
        requestError.response?.data?.detail
          || "Unable to sign in right now. Please try again.",
      );
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget && !loading) {
      onClose();
    }
  }

  return (
    <div className="login-overlay" onClick={handleOverlayClick}>
      <section
        ref={dialogRef}
        className="login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-title"
        aria-describedby="login-description"
        tabIndex={-1}
      >
        <button
          className="login-close"
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label="Close sign-in dialog"
        >
          <X size={19} />
        </button>
        <span className="login-mark" aria-hidden="true">
          <span />
        </span>
        <p className="login-eyebrow">Welcome back</p>
        <h1 id="login-title">Sign in to TaskFlow</h1>
        <p id="login-description" className="login-description">
          Use your account to continue to your team workspace.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email address</label>
          <input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error && <p className="login-error" role="alert">{error}</p>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="login-footnote">Your workspace is waiting.</p>
      </section>
    </div>
  );
}
