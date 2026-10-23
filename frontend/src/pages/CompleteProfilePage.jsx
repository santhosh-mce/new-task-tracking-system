import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileCheck,
  FileText,
  Globe,
  GraduationCap,
  Languages,
  Layers,
  LayoutDashboard,
  Link as LinkIcon,
  Lock,
  LogOut,
  MapPin,
  Plus,
  Save,
  Trash2,
  Upload,
  User,
  Wrench,
  X,
} from "lucide-react";
import api from "../api.js";
import { useAuth } from "../context/useAuth.js";
import "./CompleteProfile.css";

const qualificationOptions = [
  "B.Tech / B.E (Engineering)",
  "M.Tech / M.E (Engineering)",
  "B.Sc (Computer Science / IT / Science)",
  "M.Sc (Computer Science / IT / Science)",
  "BCA (Computer Applications)",
  "MCA (Computer Applications)",
  "BBA / MBA (Business Administration)",
  "Diploma (Polytechnic / Technical)",
  "Higher Secondary (12th / Standard)",
  "Other Professional Degree",
];

const genderOptions = ["Male", "Female", "Non-Binary", "Prefer not to say"];
const proficiencyLevels = ["Basic", "Intermediate", "Fluent", "Native"];
const employmentTypes = ["Full-time", "Part-time", "Internship", "Contract", "Freelance"];

const suggestedTechSkills = [
  "React",
  "Node.js",
  "Python",
  "JavaScript",
  "TypeScript",
  "FastAPI",
  "PostgreSQL",
  "MongoDB",
  "Docker",
  "Git",
  "HTML5/CSS3",
  "TailwindCSS",
];

const suggestedSoftSkills = [
  "Communication",
  "Teamwork",
  "Problem Solving",
  "Critical Thinking",
  "Time Management",
  "Adaptability",
  "Attention to Detail",
];

export default function CompleteProfilePage({ embedded = false }) {
  const navigate = useNavigate();
  const { user, authenticate, clearAuth } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [activeTab, setActiveTab] = useState("personal");

  // Server Profile Data
  const [profileData, setProfileData] = useState(null);

  // A. Personal Info
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [profilePhoto, setProfilePhoto] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [country, setCountry] = useState("India");
  const [department, setDepartment] = useState("Ingage");
  const [designation, setDesignation] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [reportingManagerId, setReportingManagerId] = useState("");
  const [workLocation, setWorkLocation] = useState("Chennai Office");

  // B. Education
  const [highestQualification, setHighestQualification] = useState("");
  const [educationRecords, setEducationRecords] = useState([
    {
      institution: "",
      university: "",
      degree: "",
      field_of_study: "",
      status: "Completed",
      admission_year: "",
      passing_year: "",
      score: "",
    },
  ]);

  // C. Technical Skills
  const [techSkills, setTechSkills] = useState([]);
  const [skillInput, setSkillInput] = useState("");

  // D. Soft Skills
  const [softSkills, setSoftSkills] = useState([]);
  const [softSkillInput, setSoftSkillInput] = useState("");

  // E. Languages
  const [languages, setLanguages] = useState([
    { name: "English", proficiency: "Fluent" },
  ]);

  // F. Certifications
  const [certifications, setCertifications] = useState([]);

  // G. Work & Internship Experience
  const [experiences, setExperiences] = useState([]);

  // H. Projects
  const [projects, setProjects] = useState([]);

  // I. Professional Links & Resume
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");

  // Load existing profile from backend
  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const response = await api.get("/api/users/profile/me");
        if (cancelled) return;
        const p = response.data;
        setProfileData(p);

        // Prepopulate fields
        setFullName(p.full_name || "");
        setMobile(p.mobile || "");
        setProfilePhoto(p.profile_photo || "");
        setDob(p.dob || "");
        setGender(p.gender || "");
        setAddress(p.address || "");
        setCity(p.city || "");
        setStateName(p.state || "");
        setCountry(p.country || "India");

        setDepartment(p.department || "Ingage");
        setDesignation(p.designation || "");
        setJoiningDate(p.joining_date || "");
        setReportingManagerId(p.reporting_manager_id ? String(p.reporting_manager_id) : "");
        setWorkLocation(p.work_location || "Chennai Office");

        setHighestQualification(p.highest_qualification || "");
        if (Array.isArray(p.education_records) && p.education_records.length > 0) {
          setEducationRecords(p.education_records);
        } else if (p.institution || p.degree) {
          setEducationRecords([
            {
              institution: p.institution || "",
              university: "",
              degree: p.degree || "",
              field_of_study: "",
              status: "Completed",
              admission_year: "",
              passing_year: p.graduation_year ? String(p.graduation_year) : "",
              score: "",
            },
          ]);
        }

        if (Array.isArray(p.skills)) setTechSkills(p.skills);
        if (Array.isArray(p.soft_skills)) setSoftSkills(p.soft_skills);
        if (Array.isArray(p.languages) && p.languages.length > 0) setLanguages(p.languages);
        if (Array.isArray(p.certifications)) setCertifications(p.certifications);
        if (Array.isArray(p.work_experience)) setExperiences(p.work_experience);
        if (Array.isArray(p.projects)) setProjects(p.projects);

        if (p.professional_links && typeof p.professional_links === "object") {
          setLinkedinUrl(p.professional_links.linkedin || "");
          setGithubUrl(p.professional_links.github || "");
          setPortfolioUrl(p.professional_links.portfolio || "");
        }
        setResumeUrl(p.resume_url || "");
        if (p.resume_url) {
          setResumeFileName("Saved_Resume.pdf");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Unable to load profile data.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  // Dynamic Profile Completion Percentage Calculation
  const completionPercentage = useMemo(() => {
    let score = 0;
    if (fullName.trim()) score += 15;
    if (mobile.trim().length >= 7) score += 15;
    if (department) score += 10;
    if (highestQualification || educationRecords.some((e) => e.institution || e.degree)) score += 15;
    if (techSkills.length > 0) score += 10;
    if (softSkills.length > 0) score += 5;
    if (languages.length > 0 && languages[0].name) score += 5;
    if (profilePhoto) score += 10;
    if (city.trim() || stateName.trim() || address.trim()) score += 5;
    if (
      certifications.length > 0 ||
      experiences.length > 0 ||
      projects.length > 0 ||
      resumeUrl ||
      linkedinUrl ||
      githubUrl ||
      portfolioUrl
    ) {
      score += 10;
    }
    return Math.min(100, score);
  }, [
    fullName,
    mobile,
    department,
    highestQualification,
    educationRecords,
    techSkills,
    softSkills,
    languages,
    profilePhoto,
    city,
    stateName,
    address,
    certifications,
    experiences,
    projects,
    resumeUrl,
    linkedinUrl,
    githubUrl,
    portfolioUrl,
  ]);

  // Photo Upload Handler
  async function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, JPEG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photo must be less than 5MB.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/api/users/profile/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfilePhoto(res.data.url);
      setError("");
    } catch {
      // Fallback to local Data URL
      const reader = new FileReader();
      reader.onload = (ev) => {
        setProfilePhoto(ev.target.result);
        setError("");
      };
      reader.readAsDataURL(file);
    }
  }

  // Resume Upload Handler
  async function handleResumeChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Resume must be in PDF format (.pdf).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Resume file must be less than 5MB.");
      return;
    }

    setResumeFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/api/users/profile/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResumeUrl(res.data.url);
      setError("");
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setResumeUrl(ev.target.result);
        setError("");
      };
      reader.readAsDataURL(file);
    }
  }

  // Skills Tag Handlers
  function handleAddTechSkill(e) {
    if (e) e.preventDefault();
    const s = skillInput.trim();
    if (s && !techSkills.includes(s)) {
      setTechSkills([...techSkills, s]);
      setSkillInput("");
    }
  }

  function handleRemoveTechSkill(skill) {
    setTechSkills(techSkills.filter((s) => s !== skill));
  }

  function handleAddSoftSkill(e) {
    if (e) e.preventDefault();
    const s = softSkillInput.trim();
    if (s && !softSkills.includes(s)) {
      setSoftSkills([...softSkills, s]);
      setSoftSkillInput("");
    }
  }

  function handleRemoveSoftSkill(skill) {
    setSoftSkills(softSkills.filter((s) => s !== skill));
  }

  // Education Helpers
  function handleAddEducation() {
    setEducationRecords([
      ...educationRecords,
      {
        institution: "",
        university: "",
        degree: "",
        field_of_study: "",
        status: "Completed",
        admission_year: "",
        passing_year: "",
        score: "",
      },
    ]);
  }

  function handleUpdateEducation(index, field, value) {
    const updated = [...educationRecords];
    updated[index] = { ...updated[index], [field]: value };
    setEducationRecords(updated);
  }

  function handleRemoveEducation(index) {
    setEducationRecords(educationRecords.filter((_, i) => i !== index));
  }

  // Language Helpers
  function handleAddLanguage() {
    setLanguages([...languages, { name: "", proficiency: "Fluent" }]);
  }

  function handleUpdateLanguage(index, field, value) {
    const updated = [...languages];
    updated[index] = { ...updated[index], [field]: value };
    setLanguages(updated);
  }

  function handleRemoveLanguage(index) {
    setLanguages(languages.filter((_, i) => i !== index));
  }

  // Certification Helpers
  function handleAddCertification() {
    setCertifications([
      ...certifications,
      {
        name: "",
        issuer: "",
        year: "",
        issue_date: "",
        credential_id: "",
        certificate_url: "",
        certificate_file: "",
        certificate_filename: "",
      },
    ]);
  }

  function handleUpdateCertification(index, field, value) {
    const updated = [...certifications];
    updated[index] = { ...updated[index], [field]: value };
    setCertifications(updated);
  }

  function handleRemoveCertification(index) {
    setCertifications(certifications.filter((_, i) => i !== index));
  }

  async function handleCertificateFileUpload(index, e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!validExtensions.includes(ext) && !file.type.startsWith("image/") && file.type !== "application/pdf") {
      setError("Certificate file must be a PDF or image (PNG, JPG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Certificate file must be less than 5MB.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/api/users/profile/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const updated = [...certifications];
      updated[index] = {
        ...updated[index],
        certificate_file: res.data.url,
        certificate_filename: file.name,
      };
      setCertifications(updated);
      setError("");
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const updated = [...certifications];
        updated[index] = {
          ...updated[index],
          certificate_file: ev.target.result,
          certificate_filename: file.name,
        };
        setCertifications(updated);
        setError("");
      };
      reader.readAsDataURL(file);
    }
  }

  // Work Experience Helpers
  function handleAddExperience() {
    setExperiences([
      ...experiences,
      {
        company: "",
        title: "",
        employment_type: "Full-time",
        start_date: "",
        end_date: "",
        currently_working: false,
        description: "",
      },
    ]);
  }

  function handleUpdateExperience(index, field, value) {
    const updated = [...experiences];
    updated[index] = { ...updated[index], [field]: value };
    setExperiences(updated);
  }

  function handleRemoveExperience(index) {
    setExperiences(experiences.filter((_, i) => i !== index));
  }

  // Project Helpers
  function handleAddProject() {
    setProjects([
      ...projects,
      {
        name: "",
        description: "",
        technologies: "",
        github_url: "",
        live_demo_url: "",
        start_date: "",
        end_date: "",
      },
    ]);
  }

  function handleUpdateProject(index, field, value) {
    const updated = [...projects];
    updated[index] = { ...updated[index], [field]: value };
    setProjects(updated);
  }

  function handleRemoveProject(index) {
    setProjects(projects.filter((_, i) => i !== index));
  }

  // Submit Handler
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    // Validate Required Fields
    if (!fullName.trim()) {
      setError("Full Name is required.");
      setActiveTab("personal");
      return;
    }
    if (!mobile.trim() || mobile.trim().length < 7) {
      setError("A valid Phone / Mobile Number (at least 7 digits) is required.");
      setActiveTab("personal");
      return;
    }
    if (!department) {
      setError("Department is required.");
      setActiveTab("personal");
      return;
    }

    const cleanedEdu = educationRecords.filter(
      (e) => e.institution?.trim() || e.degree?.trim() || e.highest_qualification?.trim()
    );

    if (!highestQualification && !cleanedEdu[0]?.degree && !cleanedEdu[0]?.highest_qualification) {
      setError("Highest Qualification is required. Please select your highest qualification level.");
      setActiveTab("education");
      return;
    }

    if (techSkills.length === 0) {
      setError("At least one Technical Skill is required. Please type a skill and click Add Skill.");
      setActiveTab("skills");
      return;
    }

    const cleanedCerts = certifications.filter((c) => c.name?.trim());
    const cleanedExp = experiences.filter((ex) => ex.company?.trim());
    const cleanedProjects = projects.filter((p) => p.name?.trim());
    const cleanedLanguages = languages.filter((l) => l.name?.trim());

    const payload = {
      full_name: fullName.trim(),
      mobile: mobile.trim(),
      profile_photo: profilePhoto || null,
      dob: dob || null,
      gender: gender || null,
      address: address.trim() || null,
      city: city.trim() || null,
      state: stateName.trim() || null,
      country: country.trim() || null,

      highest_qualification: highestQualification || (cleanedEdu[0]?.degree || null),
      institution: cleanedEdu[0]?.institution || null,
      degree: cleanedEdu[0]?.degree || null,
      graduation_year: cleanedEdu[0]?.passing_year ? parseInt(cleanedEdu[0].passing_year, 10) : null,
      education_records: cleanedEdu,

      skills: techSkills,
      soft_skills: softSkills,
      languages: cleanedLanguages,
      certifications: cleanedCerts,
      work_experience: cleanedExp,
      projects: cleanedProjects,
      professional_links: {
        linkedin: linkedinUrl.trim() || null,
        github: githubUrl.trim() || null,
        portfolio: portfolioUrl.trim() || null,
      },
      resume_url: resumeUrl || null,

      department: department || null,
      designation: designation.trim() || null,
      joining_date: joiningDate || null,
      reporting_manager_id: reportingManagerId ? parseInt(reportingManagerId, 10) : null,
      work_location: workLocation.trim() || null,
    };

    setSubmitting(true);
    try {
      const response = await api.post("/api/users/profile/complete", payload);
      setSuccessMsg("Your profile has been saved and marked as complete! Redirecting to your dashboard...");

      // Re-fetch current user session so AuthContext is updated
      const freshUser = await api.get("/api/auth/me");
      authenticate(freshUser.data);

      setTimeout(() => {
        const dest =
          freshUser.data.role === "admin"
            ? "/admin"
            : freshUser.data.role === "manager"
            ? "/manager"
            : "/dashboard";
        navigate(dest, { replace: true });
      }, 1200);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to save profile details. Please check required fields and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleLogout() {
    clearAuth();
    navigate("/", { replace: true });
  }

  if (loading) {
    return (
      <div className="complete-profile-page" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--taskflow-text-muted)" }}>Loading your profile details...</p>
      </div>
    );
  }

  const roleName = profileData?.role
    ? profileData.role === "team_lead"
      ? "Team Lead"
      : profileData.role.charAt(0).toUpperCase() + profileData.role.slice(1)
    : "Member";

  const isProfileComplete = profileData?.profile_status === "complete";

  return (
    <div className={`complete-profile-page${embedded ? " is-embedded" : ""}`}>
      {/* Top Header */}
      {!embedded && (
        <header className="complete-profile-header">
          <Link to="/dashboard" className="complete-profile-brand">
            <span className="complete-profile-brand-icon">T</span>
            <span className="complete-profile-brand-name">TaskFlow Workspace</span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {isProfileComplete && (
              <Link
                to={profileData?.role === "admin" ? "/admin" : profileData?.role === "manager" ? "/manager" : "/dashboard"}
                className="profile-btn-secondary"
                style={{ textDecoration: "none", fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
              >
                <LayoutDashboard size={14} /> Back to Dashboard
              </Link>
            )}
            <span style={{ fontSize: "0.85rem", color: "var(--taskflow-text-muted)" }}>
              Signed in as <strong>{profileData?.email}</strong>
            </span>
            <button
              type="button"
              className="profile-btn-secondary"
              onClick={handleLogout}
              style={{ fontSize: "0.82rem", padding: "0.4rem 0.85rem" }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </header>
      )}

      <div className="complete-profile-container">
        {/* Hero Banner */}
        <section className="complete-profile-hero">
          <div className="profile-hero-top">
            <div>
              <div className="profile-hero-badge-row">
                <span className="profile-role-tag">
                  <User size={13} /> {roleName} Account
                </span>
                <span className={`profile-status-tag ${isProfileComplete ? "is-complete" : ""}`}>
                  {isProfileComplete ? "Profile Verified & Complete" : "First-Time Profile Setup Required"}
                </span>
                {profileData?.staff_id && (
                  <span className="profile-status-tag" style={{ background: "#f8fafc", color: "#334155", borderColor: "#cbd5e1" }}>
                    ID: {profileData.staff_id}
                  </span>
                )}
              </div>
              <h1>Professional Profile Setup</h1>
              <p className="profile-hero-desc">
                Complete your personal details, academic qualifications, technical skills, and career background to activate your account.
              </p>
            </div>
            {isProfileComplete && (
              <span style={{ color: "var(--taskflow-primary)", display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.9rem" }}>
                <CheckCircle2 size={18} /> Active Status
              </span>
            )}
          </div>

          {/* Dynamic Completion Percentage Bar */}
          <div className="profile-progress-box">
            <div className="profile-progress-header">
              <span>Profile Strength</span>
              <strong>{completionPercentage}% Complete</strong>
            </div>
            <div className="profile-progress-track">
              <div className="profile-progress-fill" style={{ width: `${completionPercentage}%` }} />
            </div>
          </div>
        </section>

        {/* Feedback Messages */}
        {error && (
          <div className="profile-alert profile-alert-error" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="profile-alert profile-alert-success" role="status">
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="profile-nav-tabs" aria-label="Profile Sections">
          <button
            type="button"
            className={`profile-nav-tab ${activeTab === "personal" ? "is-active" : ""}`}
            onClick={() => setActiveTab("personal")}
          >
            <User size={15} /> 1. Personal Information
          </button>
          <button
            type="button"
            className={`profile-nav-tab ${activeTab === "education" ? "is-active" : ""}`}
            onClick={() => setActiveTab("education")}
          >
            <GraduationCap size={15} /> 2. Education & Qualification
          </button>
          <button
            type="button"
            className={`profile-nav-tab ${activeTab === "skills" ? "is-active" : ""}`}
            onClick={() => setActiveTab("skills")}
          >
            <Wrench size={15} /> 3. Skills & Languages
          </button>
          <button
            type="button"
            className={`profile-nav-tab ${activeTab === "documents" || activeTab === "certifications" ? "is-active" : ""}`}
            onClick={() => setActiveTab("documents")}
          >
            <Award size={15} /> 4. Certifications
          </button>
          <button
            type="button"
            className={`profile-nav-tab ${activeTab === "experience" ? "is-active" : ""}`}
            onClick={() => setActiveTab("experience")}
          >
            <Briefcase size={15} /> 5. Experience & Projects
          </button>
        </nav>

        <form onSubmit={handleSubmit}>
          {/* TAB 1: Personal & Contact */}
          {activeTab === "personal" && (
            <div className="profile-section-card">
              <div className="profile-section-header">
                <h2>
                  <User size={20} style={{ color: "var(--taskflow-primary)" }} /> Personal Information
                </h2>
                <p>Basic profile details</p>
              </div>

              {/* Avatar Row */}
              <div className="profile-avatar-row">
                <div className="profile-avatar-circle">
                  {profilePhoto ? (
                    <img src={profilePhoto} alt="Profile preview" className="profile-avatar-img" />
                  ) : (
                    fullName.charAt(0).toUpperCase() || "U"
                  )}
                </div>
                <div className="profile-avatar-actions">
                  <span style={{ fontSize: "0.88rem", fontWeight: 700 }}>Profile Photo</span>
                  <label className="profile-btn-secondary" style={{ cursor: "pointer", width: "fit-content" }}>
                    <Upload size={14} /> Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      style={{ display: "none" }}
                    />
                  </label>
                  <span className="profile-field-hint">PNG, JPG, or WebP up to 5MB.</span>
                </div>
              </div>

              <div className="profile-form-grid-2">
                <div className="profile-form-group">
                  <label className="profile-label">
                    Full Name <span className="profile-required-mark">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="profile-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your legal full name"
                  />
                </div>

                <div className="profile-form-group">
                  <label className="profile-label">
                    Registered Email (Read-only) <Lock size={12} style={{ color: "#94a3b8" }} />
                  </label>
                  <input
                    type="email"
                    readOnly
                    className="profile-input profile-input-readonly"
                    value={profileData?.email || ""}
                  />
                </div>

                <div className="profile-form-group">
                  <label className="profile-label">
                    Phone / Mobile Number <span className="profile-required-mark">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    className="profile-input"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+91 9876543210"
                  />
                </div>

                <div className="profile-form-group">
                  <label className="profile-label">
                    Employee / Intern ID <Lock size={12} style={{ color: "#94a3b8" }} />
                  </label>
                  <input
                    type="text"
                    readOnly
                    className="profile-input profile-input-readonly"
                    value={profileData?.employee_id || profileData?.intern_id || profileData?.staff_id || "Assigned by Administrator"}
                  />
                  <span className="profile-field-hint" style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    Assigned by Administrator (Cannot be modified)
                  </span>
                </div>

                <div className="profile-form-group">
                  <label className="profile-label">
                    Department <span className="profile-required-mark">*</span>
                  </label>
                  <select
                    className="profile-select"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                  >
                    <option value="Ingage">Ingage</option>
                    <option value="Rezov">Rezov</option>
                    <option value="Edutech">Edutech</option>
                  </select>
                </div>

                <div className="profile-form-group">
                  <label className="profile-label">Designation / Role Title</label>
                  <input
                    type="text"
                    className="profile-input"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Frontend Developer, QA Engineer"
                  />
                </div>

                <div className="profile-form-group">
                  <label className="profile-label">Date of Birth</label>
                  <input
                    type="date"
                    className="profile-input"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />
                </div>

                <div className="profile-form-group">
                  <label className="profile-label">Gender</label>
                  <select
                    className="profile-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                  >
                    <option value="">Select Gender</option>
                    {genderOptions.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Address Sub-section */}
              <div style={{ marginTop: "1.5rem", paddingTop: "1.25rem", borderTop: "1px dashed #e2e8f0" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 1rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <MapPin size={16} style={{ color: "var(--taskflow-primary)" }} /> Residential / Work Location
                </h3>
                <div className="profile-form-grid-3">
                  <div className="profile-form-group">
                    <label className="profile-label">City</label>
                    <input
                      type="text"
                      className="profile-input"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. Chennai"
                    />
                  </div>
                  <div className="profile-form-group">
                    <label className="profile-label">State</label>
                    <input
                      type="text"
                      className="profile-input"
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      placeholder="e.g. Tamil Nadu"
                    />
                  </div>
                  <div className="profile-form-group">
                    <label className="profile-label">Country</label>
                    <input
                      type="text"
                      className="profile-input"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g. India"
                    />
                  </div>
                </div>
                <div className="profile-form-group" style={{ marginTop: "1rem" }}>
                  <label className="profile-label">Full Street Address (Optional)</label>
                  <input
                    type="text"
                    className="profile-input"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Door No, Street Name, Area"
                  />
                </div>
              </div>

              {/* Step Navigation to Education */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.75rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  className="profile-btn-primary"
                  onClick={() => {
                    if (!fullName.trim()) {
                      setError("Full Name is required.");
                      return;
                    }
                    if (!mobile.trim() || mobile.trim().length < 7) {
                      setError("A valid Phone / Mobile Number (at least 7 digits) is required.");
                      return;
                    }
                    if (!department) {
                      setError("Department is required.");
                      return;
                    }
                    setError("");
                    setActiveTab("education");
                  }}
                >
                  Next: Education & Qualification <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Education & Qualification */}
          {activeTab === "education" && (
            <div className="profile-section-card">
              <div className="profile-section-header">
                <h2>
                  <GraduationCap size={20} style={{ color: "var(--taskflow-primary)" }} /> Education & Qualification
                </h2>
                <p>Highest Qualification level and academic history.</p>
              </div>

              <div className="profile-form-group" style={{ marginBottom: "1.5rem" }}>
                <label className="profile-label">
                  Highest Qualification <span className="profile-required-mark">*</span>
                </label>
                <select
                  className="profile-select"
                  value={highestQualification}
                  onChange={(e) => setHighestQualification(e.target.value)}
                >
                  <option value="">Select Qualification</option>
                  {qualificationOptions.map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>

              {/* Multi-record Education Repeater */}
              <div className="profile-repeater-list">
                {educationRecords.map((edu, idx) => (
                  <div key={idx} className="profile-repeater-card">
                    <div className="profile-repeater-header">
                      <strong>Education Record #{idx + 1}</strong>
                      {educationRecords.length > 1 && (
                        <button
                          type="button"
                          className="profile-btn-remove"
                          onClick={() => handleRemoveEducation(idx)}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      )}
                    </div>
                    <div className="profile-form-grid-2">
                      <div className="profile-form-group">
                        <label className="profile-label">College / Institution</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={edu.institution}
                          onChange={(e) => handleUpdateEducation(idx, "institution", e.target.value)}
                          placeholder="College / Institution Name"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">University</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={edu.university || ""}
                          onChange={(e) => handleUpdateEducation(idx, "university", e.target.value)}
                          placeholder="University / Board"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Specialization / Department</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={edu.degree}
                          onChange={(e) => handleUpdateEducation(idx, "degree", e.target.value)}
                          placeholder="Specialization / Department"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Education Status</label>
                        <select
                          className="profile-select"
                          value={edu.status || "Completed"}
                          onChange={(e) => handleUpdateEducation(idx, "status", e.target.value)}
                        >
                          <option value="Completed">Completed</option>
                          <option value="Pursuing">Pursuing</option>
                        </select>
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Year of Passing</label>
                        <input
                          type="number"
                          min="1970"
                          max="2035"
                          className="profile-input"
                          value={edu.passing_year || ""}
                          onChange={(e) => handleUpdateEducation(idx, "passing_year", e.target.value)}
                          placeholder="Year of Passing (e.g. 2024)"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">CGPA / Percentage</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={edu.score || ""}
                          onChange={(e) => handleUpdateEducation(idx, "score", e.target.value)}
                          placeholder="e.g. 8.5 CGPA or 85%"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="profile-btn-add"
                onClick={handleAddEducation}
              >
                <Plus size={15} /> Add Another Education
              </button>

              {/* Step Navigation to Skills */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.75rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={() => setActiveTab("personal")}
                >
                  ← Back to Personal
                </button>
                <button
                  type="button"
                  className="profile-btn-primary"
                  onClick={() => {
                    const cleanedEdu = educationRecords.filter(
                      (e) => e.institution?.trim() || e.degree?.trim() || e.highest_qualification?.trim()
                    );
                    if (!highestQualification && !cleanedEdu[0]?.degree && !cleanedEdu[0]?.highest_qualification) {
                      setError("Highest Qualification is required. Please select your highest qualification level.");
                      return;
                    }
                    setError("");
                    setActiveTab("skills");
                  }}
                >
                  Next: Skills & Languages <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: Skills & Languages */}
          {activeTab === "skills" && (
            <div className="profile-section-card">
              <div className="profile-section-header">
                <h2>
                  <Wrench size={20} style={{ color: "var(--taskflow-primary)" }} /> Skills & Languages
                </h2>
                <p>Highlight your verified technical competencies, soft skills, and language capabilities.</p>
              </div>

              {/* Technical Skills */}
              <div className="profile-skills-box" style={{ marginBottom: "1.75rem" }}>
                <label className="profile-label" style={{ marginBottom: "0.5rem" }}>
                  Technical Skills <span className="profile-required-mark">*</span>
                </label>
                <div className="profile-tags-container">
                  {techSkills.map((skill) => (
                    <span key={skill} className="profile-tag-pill is-primary">
                      {skill}
                      <button
                        type="button"
                        className="profile-tag-remove-btn"
                        onClick={() => handleRemoveTechSkill(skill)}
                        aria-label={`Remove ${skill}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {techSkills.length === 0 && (
                    <span style={{ fontSize: "0.82rem", color: "var(--taskflow-text-muted)" }}>
                      No technical skills added yet. Type below and press Enter.
                    </span>
                  )}
                </div>
                <div className="profile-tag-input-row">
                  <input
                    type="text"
                    className="profile-input"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTechSkill();
                      }
                    }}
                    placeholder="Type a skill (e.g. React, Python) and press Enter"
                  />
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={handleAddTechSkill}
                  >
                    Add Skill
                  </button>
                </div>
                <div className="profile-suggestions-row">
                  <span style={{ fontSize: "0.75rem", color: "var(--taskflow-text-muted)", marginRight: 4 }}>
                    Popular:
                  </span>
                  {suggestedTechSkills.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="profile-suggestion-chip"
                      onClick={() => {
                        if (!techSkills.includes(s)) setTechSkills([...techSkills, s]);
                      }}
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Soft Skills */}
              <div className="profile-skills-box" style={{ marginBottom: "1.75rem" }}>
                <label className="profile-label" style={{ marginBottom: "0.5rem" }}>
                  Soft Skills
                </label>
                <div className="profile-tags-container">
                  {softSkills.map((skill) => (
                    <span key={skill} className="profile-tag-pill">
                      {skill}
                      <button
                        type="button"
                        className="profile-tag-remove-btn"
                        onClick={() => handleRemoveSoftSkill(skill)}
                        aria-label={`Remove ${skill}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {softSkills.length === 0 && (
                    <span style={{ fontSize: "0.82rem", color: "var(--taskflow-text-muted)" }}>
                      No soft skills added yet. Add communication, teamwork, etc.
                    </span>
                  )}
                </div>
                <div className="profile-tag-input-row">
                  <input
                    type="text"
                    className="profile-input"
                    value={softSkillInput}
                    onChange={(e) => setSoftSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddSoftSkill();
                      }
                    }}
                    placeholder="Type a soft skill (e.g. Communication, Teamwork) and press Enter"
                  />
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={handleAddSoftSkill}
                  >
                    Add Soft Skill
                  </button>
                </div>
                <div className="profile-suggestions-row">
                  <span style={{ fontSize: "0.75rem", color: "var(--taskflow-text-muted)", marginRight: 4 }}>
                    Suggested:
                  </span>
                  {suggestedSoftSkills.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="profile-suggestion-chip"
                      onClick={() => {
                        if (!softSkills.includes(s)) setSoftSkills([...softSkills, s]);
                      }}
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Languages */}
              <div style={{ marginTop: "1.75rem", paddingTop: "1.25rem", borderTop: "1px dashed #e2e8f0" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 0.25rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <Languages size={16} style={{ color: "var(--taskflow-primary)" }} /> Languages Known & Proficiency
                </h3>
                <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>
                  ஒவ்வொரு மொழிக்கும் proficiency தேர்வு செய்யலாம்.
                </p>
                <div className="profile-repeater-list">
                  {languages.map((lang, idx) => (
                    <div key={idx} style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                      <input
                        type="text"
                        className="profile-input"
                        style={{ flex: 2 }}
                        value={lang.name}
                        onChange={(e) => handleUpdateLanguage(idx, "name", e.target.value)}
                        placeholder="e.g. English, Tamil, Hindi"
                      />
                      <select
                        className="profile-select"
                        style={{ flex: 1.5 }}
                        value={lang.proficiency}
                        onChange={(e) => handleUpdateLanguage(idx, "proficiency", e.target.value)}
                      >
                        {proficiencyLevels.map((lvl) => (
                          <option key={lvl} value={lvl}>{lvl}</option>
                        ))}
                      </select>
                      {languages.length > 1 && (
                        <button
                          type="button"
                          className="profile-btn-remove"
                          onClick={() => handleRemoveLanguage(idx)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="profile-btn-add"
                  onClick={handleAddLanguage}
                >
                  <Plus size={15} /> Add Language
                </button>
              </div>

              {/* Step Navigation to Certifications */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.75rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={() => setActiveTab("education")}
                >
                  ← Back to Education
                </button>
                <button
                  type="button"
                  className="profile-btn-primary"
                  onClick={() => {
                    if (techSkills.length === 0) {
                      setError("At least one Technical Skill is required. Please type a skill and click Add Skill.");
                      return;
                    }
                    setError("");
                    setActiveTab("documents");
                  }}
                >
                  Next: Certifications <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: Experience & Projects */}
          {activeTab === "experience" && (
            <div className="profile-section-card">
              <div className="profile-section-header">
                <h2>
                  <Briefcase size={20} style={{ color: "var(--taskflow-primary)" }} /> Internship & Work Experience
                </h2>
                <p>Document your career journey, past employers, and roles. Freshers may skip this section.</p>
              </div>

              {/* Work Experience Repeater */}
              <div className="profile-repeater-list">
                {experiences.map((exp, idx) => (
                  <div key={idx} className="profile-repeater-card">
                    <div className="profile-repeater-header">
                      <strong>Experience Record #{idx + 1}</strong>
                      <button
                        type="button"
                        className="profile-btn-remove"
                        onClick={() => handleRemoveExperience(idx)}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                    <div className="profile-form-grid-2">
                      <div className="profile-form-group">
                        <label className="profile-label">Company / Organization</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={exp.company}
                          onChange={(e) => handleUpdateExperience(idx, "company", e.target.value)}
                          placeholder="e.g. Ingage Digital"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Job Title / Role</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={exp.title}
                          onChange={(e) => handleUpdateExperience(idx, "title", e.target.value)}
                          placeholder="e.g. Software Engineer Intern"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Employment Type</label>
                        <select
                          className="profile-select"
                          value={exp.employment_type || "Full-time"}
                          onChange={(e) => handleUpdateExperience(idx, "employment_type", e.target.value)}
                        >
                          {employmentTypes.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Start Date</label>
                        <input
                          type="month"
                          className="profile-input"
                          value={exp.start_date || ""}
                          onChange={(e) => handleUpdateExperience(idx, "start_date", e.target.value)}
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">End Date</label>
                        <input
                          type="month"
                          disabled={exp.currently_working}
                          className="profile-input"
                          value={exp.end_date || ""}
                          onChange={(e) => handleUpdateExperience(idx, "end_date", e.target.value)}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", marginTop: 4, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={exp.currently_working || false}
                            onChange={(e) => handleUpdateExperience(idx, "currently_working", e.target.checked)}
                          />
                          Currently working here
                        </label>
                      </div>
                    </div>
                    <div className="profile-form-group" style={{ marginTop: "1rem" }}>
                      <label className="profile-label">Key Responsibilities / Impact</label>
                      <textarea
                        rows={3}
                        className="profile-textarea"
                        value={exp.description || ""}
                        onChange={(e) => handleUpdateExperience(idx, "description", e.target.value)}
                        placeholder="Brief summary of duties, achievements, or tech stack used."
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="profile-btn-add"
                onClick={handleAddExperience}
                style={{ marginBottom: "2rem" }}
              >
                <Plus size={15} /> Add Work / Internship Experience
              </button>

              {/* Projects Sub-section */}
              <div style={{ paddingTop: "1.5rem", borderTop: "1px dashed #e2e8f0" }}>
                <div className="profile-section-header" style={{ marginBottom: "1rem" }}>
                  <h2>
                    <Layers size={20} style={{ color: "var(--taskflow-primary)" }} /> Portfolio Projects
                  </h2>
                  <p>Showcase personal, academic, or open-source projects.</p>
                </div>

                <div className="profile-repeater-list">
                  {projects.map((proj, idx) => (
                    <div key={idx} className="profile-repeater-card">
                      <div className="profile-repeater-header">
                        <strong>Project #{idx + 1}</strong>
                        <button
                          type="button"
                          className="profile-btn-remove"
                          onClick={() => handleRemoveProject(idx)}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                      <div className="profile-form-grid-2">
                        <div className="profile-form-group">
                          <label className="profile-label">Project Name</label>
                          <input
                            type="text"
                            className="profile-input"
                            value={proj.name}
                            onChange={(e) => handleUpdateProject(idx, "name", e.target.value)}
                            placeholder="e.g. Task Management Tracker"
                          />
                        </div>
                        <div className="profile-form-group">
                          <label className="profile-label">Technologies Used</label>
                          <input
                            type="text"
                            className="profile-input"
                            value={proj.technologies || ""}
                            onChange={(e) => handleUpdateProject(idx, "technologies", e.target.value)}
                            placeholder="e.g. React, Node.js, PostgreSQL"
                          />
                        </div>
                        <div className="profile-form-group">
                          <label className="profile-label">GitHub Repository URL</label>
                          <input
                            type="url"
                            className="profile-input"
                            value={proj.github_url || ""}
                            onChange={(e) => handleUpdateProject(idx, "github_url", e.target.value)}
                            placeholder="https://github.com/..."
                          />
                        </div>
                        <div className="profile-form-group">
                          <label className="profile-label">Live Demo URL</label>
                          <input
                            type="url"
                            className="profile-input"
                            value={proj.live_demo_url || ""}
                            onChange={(e) => handleUpdateProject(idx, "live_demo_url", e.target.value)}
                            placeholder="https://demo.example.com"
                          />
                        </div>
                      </div>
                      <div className="profile-form-group" style={{ marginTop: "1rem" }}>
                        <label className="profile-label">Project Description</label>
                        <textarea
                          rows={2}
                          className="profile-textarea"
                          value={proj.description || ""}
                          onChange={(e) => handleUpdateProject(idx, "description", e.target.value)}
                          placeholder="Brief overview of features and architecture."
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="profile-btn-add"
                  onClick={handleAddProject}
                >
                  <Plus size={15} /> Add Project
                </button>

                {/* Navigation Buttons for Experience */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.75rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={() => setActiveTab("documents")}
                  >
                    ← Back to Certifications
                  </button>
                  <button
                    type="submit"
                    className="profile-btn-primary"
                    disabled={submitting}
                  >
                    <Save size={16} />
                    {submitting ? "Saving Profile..." : isProfileComplete ? "Update Profile" : "Save & Complete Profile"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Certifications & Links */}
          {(activeTab === "documents" || activeTab === "certifications") && (
            <div className="profile-section-card">
              <div className="profile-section-header">
                <h2>
                  <Award size={20} style={{ color: "var(--taskflow-primary)" }} /> Certifications
                </h2>
                <p style={{ margin: "0.25rem 0 0", color: "#64748b", fontSize: "0.88rem" }}>
                  பல certificates add செய்யும் வசதியும், certificate file upload வசதியும் இருக்க வேண்டும்.
                </p>
              </div>

              {/* Certifications List */}
              <div className="profile-repeater-list">
                {certifications.map((cert, idx) => (
                  <div key={idx} className="profile-repeater-card">
                    <div className="profile-repeater-header">
                      <strong>Certification #{idx + 1}</strong>
                      <button
                        type="button"
                        className="profile-btn-remove"
                        onClick={() => handleRemoveCertification(idx)}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    </div>
                    <div className="profile-form-grid-2">
                      <div className="profile-form-group">
                        <label className="profile-label">Certification Name</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={cert.name}
                          onChange={(e) => handleUpdateCertification(idx, "name", e.target.value)}
                          placeholder="e.g. AWS Certified Cloud Practitioner"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Issuing Organization</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={cert.issuer}
                          onChange={(e) => handleUpdateCertification(idx, "issuer", e.target.value)}
                          placeholder="e.g. Amazon Web Services, Coursera"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Year</label>
                        <input
                          type="text"
                          className="profile-input"
                          value={cert.year || cert.issue_date || ""}
                          onChange={(e) => {
                            handleUpdateCertification(idx, "year", e.target.value);
                            handleUpdateCertification(idx, "issue_date", e.target.value);
                          }}
                          placeholder="e.g. 2024"
                        />
                      </div>
                      <div className="profile-form-group">
                        <label className="profile-label">Certificate URL</label>
                        <input
                          type="url"
                          className="profile-input"
                          value={cert.certificate_url || ""}
                          onChange={(e) => handleUpdateCertification(idx, "certificate_url", e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                      <div className="profile-form-group" style={{ gridColumn: "span 2" }}>
                        <label className="profile-label">Certificate File Upload (PDF / Image up to 5MB)</label>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: 4 }}>
                          <label className="profile-btn-secondary" style={{ cursor: "pointer", width: "fit-content", padding: "0.45rem 0.9rem" }}>
                            <Upload size={14} /> {cert.certificate_file ? "Replace Certificate File" : "Upload Certificate File"}
                            <input
                              type="file"
                              accept=".pdf,image/*"
                              onChange={(e) => handleCertificateFileUpload(idx, e)}
                              style={{ display: "none" }}
                            />
                          </label>
                          {cert.certificate_file && (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "#166534" }}>
                              <FileCheck size={16} />
                              <span>{cert.certificate_filename || "Certificate attached"}</span>
                              <a
                                href={cert.certificate_file}
                                target="_blank"
                                rel="noreferrer"
                                className="profile-btn-secondary"
                                style={{ padding: "0.25rem 0.55rem", fontSize: "0.78rem", textDecoration: "none" }}
                              >
                                <ExternalLink size={12} /> View File
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="profile-btn-add"
                onClick={handleAddCertification}
                style={{ marginBottom: "2rem" }}
              >
                <Plus size={15} /> Add Certification
              </button>

              {/* Professional Links */}
              <div style={{ paddingTop: "1.5rem", borderTop: "1px dashed #e2e8f0" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 1rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <Globe size={16} style={{ color: "var(--taskflow-primary)" }} /> Professional Links
                </h3>
                <div className="profile-form-grid-3">
                  <div className="profile-form-group">
                    <label className="profile-label">LinkedIn Profile URL</label>
                    <input
                      type="url"
                      className="profile-input"
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                  <div className="profile-form-group">
                    <label className="profile-label">GitHub Profile URL</label>
                    <input
                      type="url"
                      className="profile-input"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/..."
                    />
                  </div>
                  <div className="profile-form-group">
                    <label className="profile-label">Portfolio Website URL</label>
                    <input
                      type="url"
                      className="profile-input"
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://yourportfolio.com"
                    />
                  </div>
                </div>
              </div>

              {/* Resume Upload */}
              <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px dashed #e2e8f0" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 1rem", display: "flex", alignItems: "center", gap: 6 }}>
                  <FileText size={16} style={{ color: "var(--taskflow-primary)" }} /> Resume / Curriculum Vitae (PDF)
                </h3>
                <div className="profile-upload-zone">
                  <Upload size={28} style={{ color: "var(--taskflow-primary)", margin: "0 auto 8px" }} />
                  <p style={{ margin: "0 0 6px", fontWeight: 650, fontSize: "0.9rem" }}>
                    {resumeFileName ? "Replace your uploaded Resume" : "Click to select or drop your Resume here"}
                  </p>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--taskflow-text-muted)" }}>
                    Supported format: PDF only, maximum size 5MB.
                  </p>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handleResumeChange}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
                  />
                </div>
                {resumeFileName && (
                  <div className="profile-file-info">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <FileCheck size={18} style={{ color: "var(--taskflow-success)" }} />
                      <span style={{ fontSize: "0.86rem", fontWeight: 600 }}>{resumeFileName}</span>
                    </div>
                    {resumeUrl && (
                      <a
                        href={resumeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="profile-btn-secondary"
                        style={{ padding: "0.25rem 0.65rem", fontSize: "0.78rem", textDecoration: "none" }}
                      >
                        <ExternalLink size={12} /> View Upload
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Step Navigation for Certifications */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1.75rem", paddingTop: "1rem", borderTop: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  className="profile-btn-secondary"
                  onClick={() => setActiveTab("skills")}
                >
                  ← Back to Skills
                </button>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    className="profile-btn-secondary"
                    onClick={() => setActiveTab("experience")}
                  >
                    Optional Experience →
                  </button>
                  <button
                    type="submit"
                    className="profile-btn-primary"
                    disabled={submitting}
                  >
                    <Save size={16} />
                    {submitting ? "Saving Profile..." : isProfileComplete ? "Update Profile" : "Save & Complete Profile"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
