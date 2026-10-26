import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/* ---------------------------------------------------------
   CONGRATULATIONS PAGE
   Full-screen cinematic celebration for mission completion.
   --------------------------------------------------------- */

/* Individual confetti particle */
function Particle({ delay, x }) {
  return (
    <div
      className="congrats-particle"
      style={{
        left: `${x}%`,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

export default function Congratulations() {
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Stagger the entrance
    const t = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Generate particles
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 4,
  }));

  return (
    <div className="congrats-page">
      {/* Particles background */}
      <div className="congrats-particles">
        {particles.map(p => (
          <Particle key={p.id} x={p.x} delay={p.delay} />
        ))}
      </div>

      {/* Grid lines overlay */}
      <div className="congrats-grid-overlay" />

      {/* Main content */}
      <div className={`congrats-content ${show ? 'congrats-visible' : ''}`}>
        {/* Glowing ring */}
        <div className="congrats-ring">
          <div className="congrats-ring-inner" />
        </div>

        {/* Status label */}
        <div className="congrats-status">
          <span className="congrats-status-dot" />
          SIGNAL STATUS: FULLY RECONSTRUCTED
        </div>

        {/* Main title */}
        <h1 className="congrats-title">
          <span className="congrats-title-main">ECLIPSE</span>
          <span className="congrats-title-sub">PREVENTED</span>
        </h1>

        {/* Divider */}
        <div className="congrats-divider" />

        {/* Description */}
        <p className="congrats-desc">
          All signal fragments have been captured and reconstructed.
          <br />
          Your team has successfully prevented the Eclipse.
        </p>

        {/* Stats row */}
        <div className="congrats-stats">
          <div className="congrats-stat">
            <span className="congrats-stat-value">100%</span>
            <span className="congrats-stat-label">RECONSTRUCTION</span>
          </div>
          <div className="congrats-stat-sep" />
          <div className="congrats-stat">
            <span className="congrats-stat-value">COMPLETE</span>
            <span className="congrats-stat-label">MISSION STATUS</span>
          </div>
        </div>

        {/* CTA */}
        <div className="congrats-actions">
          <button className="btn btn-primary" onClick={() => navigate('/team')}>
            &gt; View Signal Cell
          </button>
          <button className="btn btn-cyan" onClick={() => navigate('/challenges')}>
            &gt; Return to Fragments
          </button>
        </div>

        {/* Terminal line */}
        <p className="congrats-terminal">
          {'>'} CYBERGUARDIANS PROTOCOL COMPLETE — TRANSMISSION SECURED
        </p>
      </div>
    </div>
  );
}
