import { useCallback, useEffect, useState } from "react";
import api from "../api.js";
import AuthContext from "./authContext.js";
import { clearAuthSession } from "./authSession.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() =>
    sessionStorage.getItem("access_token") ? "checking" : "unauthenticated",
  );

  useEffect(() => {
    const token = sessionStorage.getItem("access_token");
    if (!token) return undefined;

    let cancelled = false;

    async function verifySession() {
      try {
        const response = await api.get("/api/auth/me");
        if (!cancelled) {
          setUser(response.data);
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          clearAuthSession();
          setUser(null);
          setStatus("unauthenticated");
        }
      }
    }

    verifySession();
    return () => {
      cancelled = true;
    };
  }, []);

  const authenticate = useCallback((authenticatedUser) => {
    setUser(authenticatedUser);
    setStatus("authenticated");
  }, []);

  const clearAuth = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        authenticate,
        clearAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
