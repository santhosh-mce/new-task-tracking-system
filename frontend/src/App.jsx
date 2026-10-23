import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import { useAuth } from "./context/useAuth.js";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLayout from "./layouts/AdminLayout";
import AdminPlaceholder from "./pages/AdminPlaceholder";
import AdminUsers from "./pages/AdminUsers";
import AdminProjects from "./pages/AdminProjects";
import StaffDirectory from "./pages/StaffDirectory";
import ProjectDetailsPage from "./pages/ProjectDetailsPage.jsx";
import ProjectFormPage from "./pages/ProjectFormPage.jsx";
import RegistrationPage from "./pages/RegistrationPage";
import AdminTasks from "./pages/AdminTasks";
import MyTasksPage from "./pages/MyTasksPage.jsx";
import AssignTasksPage from "./pages/AssignTasksPage.jsx";
import AttendancePage from "./pages/AttendancePage.jsx";
import CompleteProfilePage from "./pages/CompleteProfilePage.jsx";
import ChangePasswordPage from "./pages/ChangePasswordPage.jsx";
import EmployeesPage from "./pages/EmployeesPage.jsx";
import InternsPage from "./pages/InternsPage.jsx";
import AdminRoute from "./components/AdminRoute";
import ProtectedRoute from "./components/ProtectedRoute";

const managerRoles = ["manager"];

function LoginRedirect() {
  const { user, status } = useAuth();

  if (status === "checking") {
    return <p role="status">Checking your session...</p>;
  }

  if (!user) {
    return <Navigate to="/" replace state={{ openLogin: true }} />;
  }

  if (user.role !== "admin") {
    if (user.must_change_password) {
      return <Navigate to="/change-password" replace />;
    }

    if (user.onboarding_status === "pending" || user.profile_status === "incomplete") {
      return <Navigate to="/complete-profile" replace />;
    }
  }

  const dest = user.role === "admin"
    ? "/admin"
    : user.role === "manager"
    ? "/manager"
    : "/dashboard";
  return <Navigate to={dest} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<LoginRedirect />} />
          <Route path="/register" element={<RegistrationPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/complete-profile"
            element={
              <ProtectedRoute>
                <CompleteProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <CompleteProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <AttendancePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="employees" element={<Navigate to="/admin/users" replace />} />
            <Route path="interns" element={<Navigate to="/admin/users" replace />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="projects" element={<AdminProjects />} />
            <Route path="projects/new" element={<ProjectFormPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailsPage />} />
            <Route path="projects/:projectId/edit" element={<ProjectFormPage isEdit={true} />} />
            <Route path="staff" element={<StaffDirectory />} />
            <Route path="tasks" element={<Navigate to="my-tasks" replace />} />
            <Route path="tasks/my-tasks" element={<MyTasksPage />} />
            <Route path="tasks/assign" element={<AssignTasksPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="reports" element={<AdminPlaceholder />} />
            <Route path="settings" element={<AdminPlaceholder />} />
          </Route>

          <Route
            path="/manager"
            element={
              <ProtectedRoute>
                <AdminRoute allowedRoles={managerRoles}>
                  <AdminLayout />
                </AdminRoute>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="employees" element={<Navigate to="/manager/staff" replace />} />
            <Route path="interns" element={<Navigate to="/manager/staff" replace />} />
            <Route path="projects" element={<AdminProjects />} />
            <Route path="projects/new" element={<ProjectFormPage />} />
            <Route path="projects/:projectId" element={<ProjectDetailsPage />} />
            <Route path="projects/:projectId/edit" element={<ProjectFormPage isEdit={true} />} />
            <Route path="staff" element={<StaffDirectory />} />
            <Route path="tasks" element={<Navigate to="my-tasks" replace />} />
            <Route path="tasks/my-tasks" element={<MyTasksPage />} />
            <Route path="tasks/assign" element={<AssignTasksPage />} />
            <Route path="attendance" element={<AttendancePage />} />
          </Route>


          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}