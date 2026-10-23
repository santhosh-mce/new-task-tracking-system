export function clearAuthSession() {
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("role");
}
