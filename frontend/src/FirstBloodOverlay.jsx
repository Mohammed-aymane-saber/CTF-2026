import React, { useEffect } from 'react';

export default function FirstBloodOverlay({ challenge, onClose }) {
  // Auto-dismiss after 7 seconds
  useEffect(() => {
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fb-overlay" onClick={onClose}>
      <div className="fb-content" onClick={e => e.stopPropagation()}>
        <div className="fb-drops">
          <span className="fb-drop">🩸</span>
          <span className="fb-drop" style={{ animationDelay: '0.3s' }}>🩸</span>
          <span className="fb-drop" style={{ animationDelay: '0.6s' }}>🩸</span>
        </div>

        <div className="fb-title">
          <span className="fb-title-text">FIRST BLOOD</span>
          <span className="fb-title-glitch" aria-hidden="true">FIRST BLOOD</span>
        </div>

        <div className="fb-challenge-name">{challenge.name}</div>

        <p className="fb-subtitle">YOUR TEAM STRUCK FIRST</p>

        <div className="fb-progress">
          <div className="fb-progress-bar" />
        </div>

        <p className="fb-hint text-dim text-xs">[click or press Esc to dismiss]</p>
      </div>
    </div>
  );
}
