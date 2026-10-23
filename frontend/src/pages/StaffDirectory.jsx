import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api.js";
import StaffProfileModal from "../components/StaffProfileModal.jsx";
import "./ProjectDrilldown.css";

const categories = new Set(["Employee", "Intern", "Vendor"]);
const pageSize = 20;

export default function StaffDirectory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") || "";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [staff, setStaff] = useState([]);
  const [total, setTotal] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [requestError, setRequestError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [profileId, setProfileId] = useState(null);
  const requestKey = JSON.stringify([category, page, retry, search]);

  useEffect(() => {
    let cancelled = false;
    async function loadStaff() {
      const params = { page, page_size: pageSize };
      if (categories.has(category)) params.category = category;
      if (search.trim()) params.q = search.trim();
      try {
        const response = await api.get("/api/users", { params });
        if (cancelled) return;
        setStaff(response.data.items);
        setTotal(response.data.total);
        setLoadedKey(requestKey);
        setRequestError(null);
      } catch (requestError) {
        if (cancelled) return;
        setRequestError({
          key: requestKey,
          message: typeof requestError.response?.data?.detail === "string"
            ? requestError.response.data.detail
            : "Unable to load staff records.",
        });
      }
    }
    loadStaff();
    return () => {
      cancelled = true;
    };
  }, [category, page, requestKey, search]);

  const loading = loadedKey !== requestKey && requestError?.key !== requestKey;
  const error = requestError?.key === requestKey ? requestError.message : "";

  function setCategory(value) {
    setPage(1);
    if (value) setSearchParams({ category: value });
    else setSearchParams({});
  }

  const title = categories.has(category) ? `${category}s` : "Staff Directory";

  return (
    <div className="drilldown-page">
      <header className="drilldown-heading">
        <div>
          <p className="drilldown-eyebrow">People</p>
          <h1>{title}</h1>
          <p>Browse staff records and open a profile for recorded details.</p>
        </div>
        <span className="drilldown-count">{total} {total === 1 ? "person" : "people"}</span>
      </header>
      <section className="drilldown-panel">
        <div className="staff-toolbar">
          <label>
            <span>Staff category</span>
            <select value={categories.has(category) ? category : ""} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {[...categories].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="staff-search">
            <span>Search name or email</span>
            <input type="search" value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search staff" />
          </label>
        </div>
        {loading && <p className="table-message" role="status">Loading staff…</p>}
        {!loading && error && (
          <div className="table-message modal-error" role="alert">
            <p>{error}</p>
            <button className="taskflow-secondary-button" type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button>
          </div>
        )}
        {!loading && !error && staff.length === 0 && (
          <div className="table-message project-empty">
            <strong>No staff records found</strong>
            <span>No profile records match this category and search.</span>
          </div>
        )}
        {!loading && !error && staff.length > 0 && (
          <>
            <div className="responsive-table-wrap">
              <table className="drilldown-table staff-table">
                <thead>
                  <tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Staff category</th><th scope="col">Department</th><th scope="col">Account status</th><th scope="col">Profile</th></tr>
                </thead>
                <tbody>
                  {staff.map((person) => (
                    <tr key={person.id}>
                      <td>{person.full_name}</td>
                      <td>{person.email}</td>
                      <td>{person.staff_category || "Not categorized"}</td>
                      <td>{person.department || "Not provided"}</td>
                      <td><span className="project-status">{person.status === "invitation_pending" ? "Pending activation" : person.status}</span></td>
                      <td><button className="table-project-link" type="button" onClick={() => setProfileId(person.id)}>View profile</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="table-pagination" aria-label="Staff pages">
              <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
              <div>
                <button type="button" className="taskflow-secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
                <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
                <button type="button" className="taskflow-secondary-button" disabled={page * pageSize >= total} onClick={() => setPage((value) => value + 1)}>Next</button>
              </div>
            </nav>
          </>
        )}
      </section>
      {profileId !== null && (
        <StaffProfileModal userId={profileId} onClose={() => setProfileId(null)} />
      )}
    </div>
  );
}
