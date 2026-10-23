import { useEffect, useState } from "react";
import api from "../api.js";
import AccessibleModal from "./AccessibleModal.jsx";

function display(value) {
  return value || "Not provided";
}

function formatDate(value) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatDateTime(value) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function displayRole(profile) {
  if (profile.role === "user" && profile.staff_category) {
    return profile.staff_category;
  }
  return profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
}

export default function StaffProfileModal({ userId, onClose, onProjectSelect }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const response = await api.get(`/api/users/${userId}`);
        if (!cancelled) setProfile(response.data);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            typeof requestError.response?.data?.detail === "string"
              ? requestError.response.data.detail
              : "Unable to load this staff profile.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [retry, userId]);

  return (
    <AccessibleModal
      title={profile?.full_name || "Staff profile"}
      onClose={onClose}
      className="staff-profile-modal"
    >
      {loading && <p className="modal-message" role="status">Loading profile…</p>}
      {!loading && error && (
        <div className="modal-message modal-error" role="alert">
          <p>{error}</p>
          <button className="taskflow-secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}
      {!loading && !error && profile && (
        <div className="profile-content">
          <p className="profile-identity">
            <span>{profile.staff_category || (profile.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : "Staff")}</span>
            <span className={`profile-status status-${profile.status}`}>
              {profile.status === "invitation_pending" ? "Pending activation" : profile.status}
            </span>
          </p>
          {profile.status === "invitation_pending" && (
            <p className="profile-pending-note">
              This account is pending activation. Invitation email delivery and password setup are not configured.
            </p>
          )}
          <dl className="profile-details-grid">
            {profile.staff_id && <div><dt>Staff ID</dt><dd>{profile.staff_id}</dd></div>}
            {profile.employee_id && profile.employee_id !== profile.staff_id && <div><dt>Employee ID</dt><dd>{profile.employee_id}</dd></div>}
            {profile.intern_id && profile.intern_id !== profile.staff_id && <div><dt>Intern ID</dt><dd>{profile.intern_id}</dd></div>}
            <div><dt>Email</dt><dd>{profile.email}</dd></div>
            <div><dt>Mobile</dt><dd>{display(profile.mobile)}</dd></div>
            <div><dt>Role</dt><dd>{displayRole(profile)}</dd></div>
            <div><dt>Department</dt><dd>{display(profile.department)}</dd></div>
            <div><dt>Profile completion</dt><dd>{profile.profile_status === "complete" ? "Complete" : "Incomplete"}</dd></div>
            <div><dt>Invitation status</dt><dd>{profile.invitation_status || "Not invited"}</dd></div>
            <div><dt>Invitation sent</dt><dd>{formatDateTime(profile.invitation_sent_at)}</dd></div>
            <div><dt>Registration completed</dt><dd>{formatDateTime(profile.registration_completed_at)}</dd></div>
            <div><dt>Joining date</dt><dd>{formatDate(profile.joining_date)}</dd></div>
            <div>
              <dt>Reporting manager</dt>
              <dd>{profile.reporting_manager?.full_name || "Not provided"}</dd>
            </div>
          </dl>

          {(profile.staff_category === "Intern" || profile.education?.length > 0) && (
            <section className="profile-section">
              <h3>Education & qualification</h3>
              {profile.education?.length ? (
                <ul className="profile-list">
                  {profile.education.map((education) => (
                    <li key={education.id}>
                      <strong>{display(education.qualification)}</strong>
                      <span>
                        {[education.field_of_study, education.institution].filter(Boolean).join(" · ") || "Not provided"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <p className="profile-muted">Not provided</p>}
            </section>
          )}

          <section className="profile-section">
            <h3>Skills</h3>
            {profile.skills?.length
              ? <p className="profile-skills">{profile.skills.join(", ")}</p>
              : <p className="profile-muted">Not provided</p>}
          </section>

          <section className="profile-section">
            <h3>Assigned projects</h3>
            {profile.assigned_projects?.length ? (
              <ul className="profile-project-list">
                {profile.assigned_projects.map((project) => (
                  <li key={project.id}>
                    {onProjectSelect
                      ? <button type="button" onClick={() => onProjectSelect(project.id)}>{project.name}</button>
                      : <strong>{project.name}</strong>}
                    <span>{project.status} · {project.department}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="profile-muted">No assigned projects.</p>}
          </section>
        </div>
      )}
    </AccessibleModal>
  );
}
