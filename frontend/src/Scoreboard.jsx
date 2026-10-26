import React, { useState, useEffect, useCallback } from 'react';
import { fetchScoreboard } from './api';

export default function Scoreboard() {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchScoreboard();
      // Ensure it's an array and sort by score desc
      let scoreList = Array.isArray(data) ? data : Object.values(data);
      // Sort primarily by score desc, then by pos if available, otherwise preserve order
      scoreList.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.pos && b.pos) return a.pos - b.pos;
        return 0;
      });
      // Assign visual positions (1-indexed) based on order if not present
      scoreList = scoreList.map((s, idx) => ({ ...s, pos: s.pos || idx + 1 }));
      setScores(scoreList);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('🔒 Failed to load scoreboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading && scores.length === 0) {
    return (
      <div className="page-wrapper">
        <div className="center-screen animate-flicker">
          <h2 className="text-display text-dim" style={{ letterSpacing: '6px' }}>
            LOADING SCOREBOARD<span className="loading-dots"> </span>
          </h2>
        </div>
      </div>
    );
  }

  const top3 = scores.slice(0, 3);
  const rest = scores.slice(3);

  const renderPodium = () => {
    if (top3.length === 0) return null;
    
    // Layout: 2nd, 1st, 3rd (if they exist)
    const first = top3[0];
    const second = top3[1];
    const third = top3[2];

    return (
      <div className="podium-container animate-in">
        {second ? (
          <div className="podium-card silver">
            <div className="rank-badge">2</div>
            <h3 className="text-display" style={{ fontSize: '1.2rem', marginTop: '1rem' }}>{second.name}</h3>
            <p className="score">{second.score} pts</p>
          </div>
        ) : <div className="podium-card empty"></div>}
        
        {first && (
          <div className="podium-card gold">
            <div className="rank-badge">1</div>
            <h3 className="text-display" style={{ fontSize: '1.5rem', marginTop: '1rem' }}>{first.name}</h3>
            <p className="score">{first.score} pts</p>
          </div>
        )}
        
        {third ? (
          <div className="podium-card bronze">
            <div className="rank-badge">3</div>
            <h3 className="text-display" style={{ fontSize: '1.2rem', marginTop: '1rem' }}>{third.name}</h3>
            <p className="score">{third.score} pts</p>
          </div>
        ) : <div className="podium-card empty"></div>}
      </div>
    );
  };

  return (
    <div className="page-wrapper">
      <div className="container" style={{ padding: '2rem 1rem' }}>
        <header className="page-header" style={{ marginBottom: '3rem', textAlign: 'center' }}>
          <h1 className="text-display" style={{ fontSize: '3rem', letterSpacing: '6px' }}>TRANSMISSION RANKING</h1>
          <p className="text-dim text-upper" style={{ letterSpacing: '2px' }}>
            <span style={{ color: 'var(--clr-green)' }}>●</span> LIVE UPDATES EVERY 30S
          </p>
        </header>

        {error && <div className="panel panel-sm" style={{ borderLeft: '4px solid var(--clr-red)', marginBottom: '2rem' }}>{error}</div>}

        {scores.length === 0 && !loading && !error ? (
          <div className="center-screen" style={{ minHeight: '300px' }}>
            <p className="text-dim text-upper" style={{ letterSpacing: '2px' }}>No signals detected. Be the first to score.</p>
          </div>
        ) : (
          <div className="scoreboard-content">
            {renderPodium()}

            {rest.length > 0 && (
              <div className="scoreboard-table-container animate-in" style={{ animationDelay: '0.2s', marginTop: '3rem' }}>
                <table className="scoreboard-table w-full">
                  <thead>
                    <tr>
                      <th style={{ width: '80px', textAlign: 'center' }}>RANK</th>
                      <th style={{ textAlign: 'left' }}>TEAM NAME</th>
                      <th style={{ width: '120px', textAlign: 'right' }}>POINTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rest.map((entry) => (
                      <tr key={entry.account_id || entry.name}>
                        <td className="rank-col text-dim text-center">#{entry.pos}</td>
                        <td className="name-col" style={{ fontWeight: 'bold' }}>{entry.name}</td>
                        <td className="score-col text-right" style={{ color: 'var(--clr-cyan)' }}>{entry.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
