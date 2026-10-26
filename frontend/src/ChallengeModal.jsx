import React, { useState, useEffect } from 'react';
import { fetchChallengeDetail, submitFlag, fetchFirstSolve, getMe } from './api';
import { sanitizeHtml } from './utils/sanitize';

function challengeFileLabel(fileUrl) {
  if (typeof fileUrl !== 'string') return 'attachment';
  const pathOnly = fileUrl.split('?')[0];
  const seg = pathOnly.split('/').filter(Boolean);
  const raw = seg[seg.length - 1] || 'file';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function ChallengeModal({ challenge, isFirstBlood, onClose, onSolve }) {
  const [detail, setDetail]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [flag, setFlag]           = useState('');
  const [state, setState]         = useState(null); // null|submitting|correct|incorrect|already_solved|ratelimited|error
  const [message, setMessage]     = useState('');

  useEffect(() => {
    fetchChallengeDetail(challenge.id)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [challenge.id]);

  // Close on Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!flag.trim() || state === 'submitting' || state === 'correct') return;
    setState('submitting');
    setMessage('');
    try {
      const result = await submitFlag(challenge.id, flag.trim());

      if (result.status === 'correct') {
        setState('correct');
        setMessage(result.message || 'Signal captured!');

        // First blood check — 1 extra request, only on correct submission
        let isFirstBlood = false;
        try {
          const [firstSolve, me] = await Promise.all([
            fetchFirstSolve(challenge.id),
            getMe(),
          ]);
          if (firstSolve && me) {
            // Works for both teams mode (team_id) and individual mode (id)
            isFirstBlood =
              firstSolve.account_id === me.team_id ||
              firstSolve.account_id === me.id;
          }
        } catch { /* non-fatal */ }

        onSolve(challenge.id, isFirstBlood);
      } else {
        setState(result.status ?? 'incorrect');
        setMessage(result.message || 'Signal rejected.');
      }
    } catch (err) {
      setState('error');
      setMessage(err.message);
    }
  };

  const solved = challenge.solved_by_me || state === 'correct';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-panel${isFirstBlood ? ' modal-first-blood' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-md mb-sm">
            <span className="text-xs text-upper text-dim" style={{ letterSpacing: '2px' }}>
              {challenge.category}
            </span>
            {isFirstBlood && <span className="fb-card-badge" style={{ position: 'static' }}>🩸 FIRST BLOOD</span>}
          </div>
          <h2 className="modal-title">{challenge.name}</h2>
          <div className="flex gap-lg mt-sm items-center">
            <span className="text-display" style={{ color: 'var(--clr-green)', fontSize: '1.3rem' }}>
              {detail?.value ?? challenge.value} pts
            </span>
            {!loading && detail != null && (
              <>
                <span className="text-dim text-xs">{detail.solves} solve{detail.solves !== 1 ? 's' : ''}</span>
                {detail.author && (
                  <span className="text-dim text-xs ml-sm">by {detail.author}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="modal-body">
          {loading ? (
            <p className="text-dim"><span className="loading-dots">Loading</span></p>
          ) : detail?.description ? (
            <div
              className="challenge-description"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(detail.description) }}
            />
          ) : (
            <p className="text-dim text-sm">[No description provided]</p>
          )}

          {/* Connection Info (URLs, nc commands, etc) */}
          {!loading && detail?.connection_info && (
            <div className="challenge-connection-container">
              <h4 className="text-xs text-upper text-green mb-sm" style={{ letterSpacing: '1px', opacity: 0.8 }}>
                🔗 Connection Info
              </h4>
              {detail.connection_info.startsWith('http') ? (
                <a 
                  href={detail.connection_info} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-full"
                  style={{ marginBottom: 'var(--space-md)' }}
                >
                  🌐 OPEN CHALLENGE LINK
                </a>
              ) : (
                <div className="connection-box">
                  <code>{detail.connection_info}</code>
                </div>
              )}
            </div>
          )}

          {!loading && detail?.files?.length > 0 && (
            <div className="challenge-files-container">
              <h4 className="text-xs text-upper text-cyan mb-sm" style={{ letterSpacing: '1px', opacity: 0.8 }}>
                📡 Download Resources
              </h4>
              <div className="challenge-files">
                {detail.files.map((file, i) => {
                  const href = typeof file === 'string' ? file : file.location || file.path;
                  const label = challengeFileLabel(href);
                  return (
                    <a
                      key={`${href}-${i}`}
                      className="btn btn-cyan challenge-file-link"
                      href={href}
                      title={label}
                      rel="noopener noreferrer"
                      download
                    >
                      <span className="file-icon">📁</span> {label}
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Flag submission */}
        <div className="modal-footer">
          {solved ? (
            <div className="alert alert-success">[✓] SIGNAL CAPTURED</div>
          ) : (
            <form onSubmit={handleSubmit} className="flag-form">
              <input
                type="text"
                className="form-input"
                placeholder="ECLIPSE{...}"
                value={flag}
                onChange={e => setFlag(e.target.value)}
                disabled={state === 'submitting'}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={state === 'submitting'}
              >
                {state === 'submitting'
                  ? <span className="loading-dots">Transmitting</span>
                  : '> Submit'}
              </button>

              {state === 'incorrect' && (
                <div className="alert alert-error mt-sm">[✗] {message}</div>
              )}
              {state === 'already_solved' && (
                <div className="alert alert-info mt-sm">[!] Already captured.</div>
              )}
              {state === 'ratelimited' && (
                <div className="alert alert-error mt-sm">[!] Rate limited — slow down.</div>
              )}
              {state === 'error' && (
                <div className="alert alert-error mt-sm">[!] {message}</div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
