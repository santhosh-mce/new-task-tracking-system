import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth.js";

export default function ProtectedRoute({ children }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "checking") {
    return <p className="auth-loading" role="status">Checking your session...</p>;
  }

  if (!user) {
    return (
      <Navigate
        to="/"
        replace
        state={{ openLogin: true, from: location.pathname }}
      />
    );
  }

  if (user.role !== "admin") {
    if (user.must_change_password && location.pathname !== "/change-password") {
      return <Navigate to="/change-password" replace />;
    }

    if (
      (user.onboarding_status === "pending" || user.profile_status === "incomplete") &&
      location.pathname !== "/complete-profile" &&
      location.pathname !== "/change-password"
    ) {
      return <Navigate to="/complete-profile" replace />;
    }
  }

  return children;
}