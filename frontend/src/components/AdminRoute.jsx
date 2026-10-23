import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";

const defaultAllowedRoles = ["admin"];

export default function AdminRoute({ children, allowedRoles = defaultAllowedRoles }) {
  const navigate = useNavigate();
  const { clearAuth } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function verifyAdmin() {
      try {
        const response = await api.get("/api/auth/me");
        if (cancelled) return;

        if (!allowedRoles.includes(response.data.role)) {
          navigate("/dashboard", { replace: true });
          return;
        }

        setHasAccess(true);
      } catch (requestError) {
        if (cancelled) return;

        if (requestError.response?.status === 401) {
          clearAuth();
          navigate("/", { replace: true, state: { openLogin: true } });
          return;
        }

        setError("Unable to verify administrator access.");
      }
    }

    verifyAdmin();
    return () => {
      cancelled = true;
    };
  }, [allowedRoles, attempt, clearAuth, navigate]);

  if (error) {
    return (
      <main className="admin-gate">
        <p role="alert">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          Retry
        </button>
      </main>
    );
  }

  if (!hasAccess) {
    return <p className="admin-gate" role="status">Verifying workspace access...</p>;
  }

  return <>{children}</>;
}
