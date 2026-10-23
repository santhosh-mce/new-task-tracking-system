import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Login from "./Login";
import "./Landing.css";

const navigation = [
  { label: "Home", href: "#home" },
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "#about" },
];

const values = [
  { icon: ClipboardCheck, title: "Organized Work" },
  { icon: Users, title: "Clear Ownership" },
  { icon: BarChart3, title: "Real-Time Progress" },
  { icon: MessageSquareText, title: "Better Collaboration" },
];

const features = [
  {
    number: "01",
    icon: Users,
    title: "Task assignment",
    description:
      "Give each piece of work an owner so responsibilities stay visible and clear.",
  },
  {
    number: "02",
    icon: CalendarDays,
    title: "Projects & deadlines",
    description:
      "Keep project work and due dates together, helping everyone see what is next.",
  },
  {
    number: "03",
    icon: ShieldCheck,
    title: "Role-based access",
    description:
      "Support a more orderly workspace with access shaped around a person’s role.",
  },
  {
    number: "04",
    icon: MessageSquareText,
    title: "Team collaboration",
    description:
      "Bring people around shared work and make it easier to stay aligned.",
  },
  {
    number: "05",
    icon: BarChart3,
    title: "Progress monitoring",
    description:
      "See how work is moving and spot tasks that may need a follow-up.",
  },
  {
    number: "06",
    icon: ClipboardCheck,
    title: "Reports & visibility",
    description:
      "Get a clearer view of project activity and team workload at a glance.",
  },
];

const steps = [
  {
    number: "01",
    title: "Bring your team together",
    description:
      "Set up your workspace and give people the access they need for their role.",
  },
  {
    number: "02",
    title: "Organize the work",
    description:
      "Create tasks, assign an owner, and keep important dates in view.",
  },
  {
    number: "03",
    title: "Move work forward",
    description:
      "Check progress, share updates, and keep everyone focused on what matters.",
  },
];

const roles = [
  {
    initial: "A",
    title: "Admin",
    description:
      "Oversees workspace access and helps keep the team setup organized.",
  },
  {
    initial: "M",
    title: "Manager",
    description:
      "Coordinates team priorities and keeps an eye on work in progress.",
  },
  {
    initial: "E",
    title: "Employee",
    description:
      "Works through assigned responsibilities and shares progress with the team.",
  },
  {
    initial: "I",
    title: "Intern",
    description:
      "Gets a clear view of assigned work, expectations, and due dates.",
  },
  {
    initial: "V",
    title: "Vendor",
    description:
      "Can be included in a team’s coordination around relevant project work.",
  },
];

function Brand({ footer = false }) {
  return (
    <Link
      className={`brand${footer ? " brand-footer" : ""}`}
      to="/"
      aria-label="TaskFlow home"
    >
      <span className="brand-mark" aria-hidden="true">
        <Check size={17} strokeWidth={3} />
      </span>
      <span>TaskFlow</span>
    </Link>
  );
}

function TaskPreview() {
  return (
    <div className="preview-shell" aria-label="Illustration of a task dashboard">
      <div className="preview-topbar">
        <div className="preview-window-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="preview-address">workspace / overview</span>
        <span className="preview-topbar-mark" aria-hidden="true">
          <Check size={13} strokeWidth={3} />
        </span>
      </div>
      <div className="preview-body">
        <aside className="preview-sidebar" aria-hidden="true">
          <div className="preview-sidebar-brand">
            <span className="preview-mini-mark">
              <Check size={11} strokeWidth={3} />
            </span>
            <span>Workspace</span>
          </div>
          <span className="preview-sidebar-label">MENU</span>
          <span className="preview-nav-item preview-nav-active">
            <ClipboardCheck size={14} />
            Overview
          </span>
          <span className="preview-nav-item">
            <CheckCircle2 size={14} />
            My tasks
          </span>
          <span className="preview-nav-item">
            <CalendarDays size={14} />
            Calendar
          </span>
          <span className="preview-sidebar-label preview-project-label">
            PROJECTS
          </span>
          <span className="preview-project-row">
            <i />
            Website refresh
          </span>
          <span className="preview-project-row">
            <i />
            Team onboarding
          </span>
          <div className="preview-sidebar-profile">
            <span className="preview-avatar">JD</span>
            <span>
              <strong>Jordan Davis</strong>
              <small>Team member</small>
            </span>
          </div>
        </aside>

        <div className="preview-content">
          <div className="preview-greeting">
            <div>
              <span className="preview-date">MONDAY, OCTOBER 19</span>
              <h3>Good morning, Jordan <span aria-hidden="true">✳</span></h3>
              <p>Here&apos;s what&apos;s happening with your work today.</p>
            </div>
            <button type="button" className="preview-add-button" tabIndex={-1}>
              + New task
            </button>
          </div>

          <div className="preview-stats">
            <div className="preview-stat-card">
              <span>My tasks</span>
              <strong>12</strong>
              <small><i /> 4 due this week</small>
            </div>
            <div className="preview-stat-card">
              <span>In progress</span>
              <strong>08</strong>
              <small><i /> Across 3 projects</small>
            </div>
            <div className="preview-stat-card">
              <span>Completed</span>
              <strong>24</strong>
              <small><i /> This month</small>
            </div>
          </div>

          <div className="preview-task-heading">
            <strong>Upcoming tasks</strong>
            <span>View all <ArrowRight size={12} /></span>
          </div>
          <div className="preview-task-list">
            <div className="preview-task-row">
              <span className="preview-task-check"><Check size={11} /></span>
              <span className="preview-task-name">
                <strong>Review homepage copy</strong>
                <small>Website refresh</small>
              </span>
              <span className="preview-task-date"><CalendarDays size={12} /> Today</span>
              <span className="preview-task-avatar">JD</span>
            </div>
            <div className="preview-task-row">
              <span className="preview-task-check" />
              <span className="preview-task-name">
                <strong>Prepare project kickoff</strong>
                <small>Team onboarding</small>
              </span>
              <span className="preview-task-date"><CalendarDays size={12} /> Oct 22</span>
              <span className="preview-task-avatar avatar-alt">AM</span>
            </div>
            <div className="preview-task-row preview-task-row-last">
              <span className="preview-task-check" />
              <span className="preview-task-name">
                <strong>Share design feedback</strong>
                <small>Website refresh</small>
              </span>
              <span className="preview-task-date"><CalendarDays size={12} /> Oct 24</span>
              <span className="preview-task-avatar avatar-third">KL</span>
            </div>
          </div>
          <div className="preview-footer-note">
            <Clock3 size={12} />
            Your priorities, all in one place
          </div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(() =>
    Boolean(location.state?.openLogin),
  );

  function closeMenu() {
    setMenuOpen(false);
  }

  const closeLogin = useCallback(() => {
    setLoginOpen(false);
  }, []);

  useEffect(() => {
    if (location.state?.openLogin) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  function openLogin() {
    closeMenu();
    setLoginOpen(true);
  }

  return (
    <>
    <div className="landing-page" inert={loginOpen}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <nav className="navbar landing-container" aria-label="Main navigation">
          <Brand />
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div
            className={`nav-menu${menuOpen ? " nav-menu-open" : ""}`}
            id="primary-navigation"
          >
            <div className="nav-links">
              {navigation.map((item) => (
                <a key={item.href} href={item.href} onClick={closeMenu}>
                  {item.label}
                </a>
              ))}
            </div>
            <div className="nav-actions">
              <button className="nav-login" type="button" onClick={openLogin}>
                Login
              </button>
              <button className="button button-small" type="button" onClick={openLogin}>
                Get Started <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section className="hero-section" id="home">
          <div className="hero-grid landing-container">
            <div className="hero-copy">
              <div className="hero-kicker">
                <span className="kicker-line" />
                A clearer way to work together
              </div>
              <h1>
                Manage Tasks.
                <br />
                Empower Your Team.
                <br />
                <span>Deliver More.</span>
              </h1>
              <p className="hero-description">
                Bring tasks, people, and priorities into one clear workspace.
                Keep work moving and help your team do their best work.
              </p>
              <div className="hero-actions">
                <button className="button" type="button" onClick={openLogin}>
                  Get Started <ArrowRight size={17} />
                </button>
                <a className="button button-outline" href="#features">
                  Explore Features <ArrowDown size={16} />
                </a>
              </div>
              <div className="hero-assurance">
                <span className="assurance-check"><Check size={12} /></span>
                <span>A focused workspace for work that matters.</span>
              </div>
            </div>
            <div className="hero-visual">
              <span className="visual-label visual-label-top">
                <span className="visual-label-dot" />
                WORK, IN CLEAR VIEW
              </span>
              <TaskPreview />
              <div className="visual-note">
                <span className="visual-note-icon"><CheckCircle2 size={18} /></span>
                <span><strong>One team. One view.</strong><small>Everything moving together.</small></span>
              </div>
            </div>
          </div>
          <div className="hero-bottom-rule" />
        </section>

        <section className="value-strip" aria-label="Ways TaskFlow helps your team">
          <div className="value-items landing-container">
            {values.map(({ icon: Icon, title }) => (
              <div className="value-item" key={title}>
                <span className="value-icon"><Icon size={18} strokeWidth={1.9} /></span>
                <span>{title}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="features-section section-space" id="features">
          <div className="landing-container">
            <div className="section-heading">
              <span className="section-eyebrow">Everything in sync</span>
              <h2>Make good work <span>flow.</span></h2>
              <p>
                The essentials your team needs to stay organized, accountable,
                and moving in the same direction.
              </p>
            </div>
            <div className="feature-grid">
              {features.map(({ number, icon: Icon, title, description }) => (
                <article className="feature-card" key={number}>
                  <div className="feature-card-top">
                    <span className="feature-icon"><Icon size={21} strokeWidth={1.8} /></span>
                    <span className="feature-number">{number}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <span className="feature-card-rule" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="process-section section-space" id="how-it-works">
          <div className="landing-container process-layout">
            <div className="process-intro">
              <span className="section-eyebrow">Simple by design</span>
              <h2>From scattered to <span>in sync.</span></h2>
              <p>
                A straightforward rhythm helps your team spend less time
                coordinating and more time doing.
              </p>
              <a className="text-link" href="#about">
                Find your team&apos;s fit <ArrowRight size={16} />
              </a>
            </div>
            <div className="process-steps">
              {steps.map((step, index) => (
                <article className="process-step" key={step.number}>
                  <div className="step-number-column">
                    <span className="step-number">{step.number}</span>
                    {index < steps.length - 1 && <span className="step-connector" />}
                  </div>
                  <div className="step-copy">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                  <ArrowRight className="step-arrow" size={17} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="roles-section section-space" id="about">
          <div className="landing-container">
            <div className="roles-heading-row">
              <div className="section-heading section-heading-left">
                <span className="section-eyebrow">One workspace, every perspective</span>
                <h2>Built around how <span>teams work.</span></h2>
                <p>
                  Different roles bring different strengths. Give everyone a
                  clear place in the work.
                </p>
              </div>
              <div className="roles-heading-mark" aria-hidden="true">
                <Users size={28} strokeWidth={1.5} />
              </div>
            </div>
            <div className="role-grid">
              {roles.map((role) => (
                <article className="role-card" key={role.title}>
                  <span className="role-initial">{role.initial}</span>
                  <h3>{role.title}</h3>
                  <p>{role.description}</p>
                </article>
              ))}
            </div>
            <p className="role-note">
              Available actions depend on your workspace setup and assigned access.
            </p>
          </div>
        </section>

        <section className="closing-section">
          <div className="closing-inner landing-container">
            <span className="closing-mark" aria-hidden="true">
              <Check size={19} strokeWidth={3} />
            </span>
            <div className="closing-copy">
              <span className="section-eyebrow">Make space for momentum</span>
              <h2>Good work starts with a clear next step.</h2>
              <p>Bring your team&apos;s tasks together and take it from there.</p>
            </div>
            <button className="button closing-button" type="button" onClick={openLogin}>
              Get Started <ArrowRight size={17} />
            </button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-main landing-container">
          <div className="footer-brand-block">
            <Brand footer />
            <p>Clear tasks. Connected teams. Work that moves.</p>
          </div>
          <div className="footer-links">
            <div className="footer-link-group">
              <span>Explore</span>
              <a href="#features">Features</a>
              <a href="#how-it-works">How It Works</a>
              <a href="#about">About</a>
            </div>
            <div className="footer-link-group">
              <span>Account</span>
              <button type="button" onClick={openLogin}>Login</button>
              <button type="button" onClick={openLogin}>Get Started</button>
            </div>
          </div>
          <a className="back-to-top" href="#home" aria-label="Back to top">
            <ArrowDown size={16} />
          </a>
        </div>
        <div className="footer-bottom">
          <div className="landing-container footer-bottom-inner">
            <span>© {new Date().getFullYear()} TaskFlow. All rights reserved.</span>
            <span>Thoughtful work, together.</span>
          </div>
        </div>
      </footer>
    </div>
    {loginOpen && <Login onClose={closeLogin} />}
    </>
  );
}

export default Landing;
