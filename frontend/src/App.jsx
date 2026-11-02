import React, { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useNavigate,
  Navigate,
} from 'react-router-dom';
import { fetchCsrfNonce, logoutHunter, checkAuth } from './api';
import Login from './Login';

import Challenges from './Challenges';
import Scoreboard from './Scoreboard';
import Team from './Team';
import Congratulations from './Congratulations';

/* ---------------------------------------------------------
   ROUTE GUARD
   Calls /api/v1/users/me to verify the session is active.
   Shows a loading splash while resolving, then either renders
   the child page or redirects to /login.
   --------------------------------------------------------- */
function ProtectedRoute({ children }) {
  const [status, setStatus] = useState('pending'); // pending | ok | unauth

  useEffect(() => {
    checkAuth().then((authed) => setStatus(authed ? 'ok' : 'unauth'));
  }, []);

  if (status === 'pending') {
    return (
      <div className="center-screen boot-screen">
        <h2 className="text-display text-dim boot-title">
          VERIFYING<span className="loading-dots"> </span>
        </h2>
      </div>
    );
  }

  if (status === 'unauth') {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/* ---------------------------------------------------------
   NAVBAR COMPONENT — with mobile hamburger
   --------------------------------------------------------- */
function Navbar({ onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  const handleNavClick = () => setMenuOpen(false);

  return (
    <aside className={`app-sidebar${menuOpen ? ' nav-open' : ''}`}>
      <div className="sidebar-inner">
        <NavLink to="/" className="nav-brand" onClick={handleNavClick}>
          <span className="brand-mark" aria-hidden="true">◐</span>
          <span>ECLIPSE<small>CTF / CORONA</small></span>
        </NavLink>
        <div className="sidebar-kicker">OPERATOR CONSOLE</div>

        {/* Hamburger toggle */}
        <button
          className={`hamburger sidebar-toggle ${menuOpen ? 'is-active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>

        <ul className="nav-links">
          <li>
            <NavLink
              to="/challenges"
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={handleNavClick}
            >
              <span className="nav-index">01</span>Challenges
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/scoreboard"
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={handleNavClick}
            >
              <span className="nav-index">02</span>Scoreboard
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/team"
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={handleNavClick}
            >
              <span className="nav-index">03</span>MY SIGNAL CELL
            </NavLink>
          </li>
          {onLogout && (
            <li>
              <button
                onClick={() => { onLogout(); handleNavClick(); }}
                className="btn btn-quiet"
              >
                Sign out
              </button>
            </li>
          )}
        </ul>
        <div className="sidebar-footer"><span className="status-dot" /> GATEWAY ONLINE</div>
      </div>
    </aside>
  );
}

/* ---------------------------------------------------------
   LANDING PAGE — Immersive CyberGuardians themed
   --------------------------------------------------------- */
function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <div className="landing-orbit" aria-hidden="true">
        <div className="orbit-core" />
        <div className="orbit-ring orbit-ring-one" />
        <div className="orbit-ring orbit-ring-two" />
      </div>

      {/* Radial glow effects */}
      <div className="landing-glow landing-glow-1" />
      <div className="landing-glow landing-glow-2" />

      {/* Floating particles */}
      <div className="landing-particles">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="landing-particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 6}s`,
              animationDuration: `${4 + Math.random() * 6}s`,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="landing-content app-content">
        {/* Status indicator */}
        <div className="landing-status animate-in">
          <span className="landing-status-dot" />
          SYSTEM ONLINE — AWAITING OPERATORS
        </div>

        {/* Logo */}
        <div className="landing-logo animate-in delay-1">
          <p className="eyebrow">ECL / 2026</p>
          <h1 className="landing-title">ECLIPSE</h1>
          <div className="landing-subtitle">
            <span className="landing-line" />
            <span>CYBERGUARDIANS CTF</span>
            <span className="landing-line" />
          </div>
        </div>

        {/* Tagline */}
        <p className="landing-tagline animate-in delay-2">
          Decode the signals. Capture the fragments. Prevent the Eclipse.
        </p>

        {/* CTA Buttons */}
        <div className="landing-actions animate-in delay-3">
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/challenges')}>
            &gt; ACCESS CHALLENGES
          </button>
          <button className="btn btn-secondary btn-lg" onClick={() => navigate('/scoreboard')}>
            &gt; VIEW SCOREBOARD
          </button>
        </div>

        {/* Footer status */}
        <div className="landing-footer animate-in delay-4">
          <div className="landing-footer-line">
            <span className="text-green">▸</span> Gateway: <span className="text-green">ACTIVE</span>
          </div>
          <div className="landing-footer-line">
            <span className="text-green">▸</span> Protocol: <span className="text-cyan">ECLIPSE-6</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   ROOT APP
   --------------------------------------------------------- */
export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetchCsrfNonce().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="center-screen boot-screen">
        <h2 className="text-display text-dim boot-title">
          BOOTING<span className="loading-dots"> </span>
        </h2>
      </div>
    );
  }

  const handleLogout = async (navigate) => {
    await logoutHunter();
    navigate('/login');
  };

  return (
    <BrowserRouter>
      <AppRoutes onLogout={handleLogout} />
    </BrowserRouter>
  );
}

function AppRoutes({ onLogout }) {
  const navigate = useNavigate();

  return (
    <>
      <Routes>
        {/* Public routes — no navbar */}
        <Route path="/login" element={<Login />} />

        {/* Protected app routes — redirect to /login if not authed */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <>
                <Navbar onLogout={() => onLogout(navigate)} />
                <main className="app-main">
                  <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/challenges" element={<Challenges />} />
                  <Route path="/scoreboard" element={<Scoreboard />} />
                  <Route path="/team" element={<Team />} />
                  <Route path="/congratulations" element={<Congratulations />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}
