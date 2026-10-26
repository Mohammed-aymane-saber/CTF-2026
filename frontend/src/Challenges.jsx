import React, { useState, useEffect, useCallback } from 'react';
import { fetchChallenges, apiFetch, fetchTeamAwards, claimPuzzlePiece } from './api';
import ChallengeModal from './ChallengeModal';
import FirstBloodOverlay from './FirstBloodOverlay';

/* ---------------------------------------------------------
   CATEGORY COLOR — deterministic cycle per category name
   --------------------------------------------------------- */
const PALETTE = [
  'var(--clr-cyan)',
  'var(--clr-purple)',
  'var(--clr-orange)',
  'var(--clr-yellow)',
  'var(--clr-green)',
];
const colorCache = {};
let colorIdx = 0;
function catColor(category) {
  if (!colorCache[category]) colorCache[category] = PALETTE[colorIdx++ % PALETTE.length];
  return colorCache[category];
}


/* ---------------------------------------------------------
   CHALLENGE CARD
   --------------------------------------------------------- */
function ChallengeCard({ challenge, onSelect, isFirstBlood, isClaimed, onClaim }) {
  const { name, value, category, difficulty, solved_by_me, tags } = challenge;
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState(null);
  
  // Logic for New & Mystery
  const isNew = tags?.some(t => t.value.toLowerCase() === 'new');
  const isMystery = category?.toLowerCase() === 'mystery' || tags?.some(t => t.value.toLowerCase() === 'mystery');
  
  const color = isMystery ? 'var(--clr-purple)' : catColor(category);
  
  // Format difficulty badge
  let diffBadge = null;
  if (difficulty && !isMystery) {
    const diffStr = String(difficulty).toLowerCase();
    if (diffStr.includes('easy')) diffBadge = { label: 'EASY', color: 'var(--clr-green)' };
    else if (diffStr.includes('med')) diffBadge = { label: 'MED', color: 'var(--clr-yellow)' };
    else if (diffStr.includes('hard')) diffBadge = { label: 'HARD', color: 'var(--clr-red)' };
    else if (diffStr.includes('insane')) diffBadge = { label: 'INSANE', color: 'var(--clr-purple)' };
    else diffBadge = { label: String(difficulty).toUpperCase().substring(0, 4), color: 'var(--clr-text-dim)' };
  }

  return (
    <div
      className={`challenge-card${solved_by_me ? ' card-solved' : ''}${isFirstBlood ? ' card-first-blood' : ''}${isMystery ? ' card-mystery' : ''}`}
      style={{ '--cat-color': color }}
      onClick={() => onSelect(challenge)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(challenge)}
    >
      {isFirstBlood && <span className="fb-card-badge">🩸</span>}
      
      {isMystery && !solved_by_me && (
        <div className="mystery-overlay">
          <span className="mystery-icon">?</span>
        </div>
      )}

      <div className="card-top">
        <span className="card-category" style={{ color }}>{category.toUpperCase()}</span>
        <div className="flex gap-sm">
          {isNew && <span className="badge badge-new">NEW</span>}
          {diffBadge && (
            <span className="badge-diff" style={{ color: diffBadge.color, borderColor: diffBadge.color }}>
              {diffBadge.label}
            </span>
          )}
        </div>
      </div>

      <h3 className="card-title">{name}</h3>

      <div className="card-bottom" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 3, position: 'relative' }}>
        <div>
          <span className="card-pts" style={{ color }}>{value} pts</span>
          {claimError && <div className="text-xs text-red mt-xs" style={{ whiteSpace: 'nowrap' }}>{claimError}</div>}
        </div>
        {solved_by_me && !isClaimed && (
          <button 
            className="btn-claim-fragment"
            disabled={isClaiming}
            onClick={async (e) => {
              e.stopPropagation();
              setIsClaiming(true);
              setClaimError(null);
              try {
                await onClaim(challenge);
              } catch (err) {
                setClaimError(err.message);
                setIsClaiming(false);
              }
            }}
          >
            {isClaiming ? "TRANSMITTING..." : "CLAIM FRAGMENT"}
          </button>
        )}
      </div>

      {solved_by_me && isClaimed && <div className="card-solved-stamp text-green" style={{ textShadow: '0 0 5px var(--clr-green)' }}>FRAGMENT SECURED</div>}
      {solved_by_me && !isClaimed && <div className="card-solved-stamp">CAPTURED</div>}
    </div>
  );
}

/* ---------------------------------------------------------
   FILTER BAR
   --------------------------------------------------------- */
function FilterBar({ challenges, filters, onChange }) {
  const categories = ['All', ...new Set(challenges.map(c => c.category))];

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <span className="filter-label">SECTOR</span>
        <div className="filter-pills">
          {categories.map(cat => (
            <button
              key={cat}
              className={`filter-pill${filters.category === cat ? ' active' : ''}`}
              onClick={() => onChange({ ...filters, category: cat })}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-row">
        <span className="filter-label">TIER</span>
        <div className="filter-pills">
          {['All', 'Easy', 'Medium', 'Hard', 'Insane'].map(d => (
            <button
              key={d}
              className={`filter-pill${filters.difficulty === d ? ' active' : ''}`}
              onClick={() => onChange({ ...filters, difficulty: d })}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="filter-right">
          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={filters.hideSolved}
              onChange={e => onChange({ ...filters, hideSolved: e.target.checked })}
            />
            <span>Hide Captured</span>
          </label>
          <input
            type="text"
            className="form-input filter-search"
            placeholder="Search signals..."
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   CHALLENGES PAGE
   --------------------------------------------------------- */
export default function Challenges() {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [selected, setSelected]     = useState(null);
  const [firstBloods, setFirstBloods]           = useState(new Set());
  const [firstBloodAnnounce, setFirstBloodAnnounce] = useState(null);
  const [filters, setFilters] = useState({
    category: 'All', difficulty: 'All', hideSolved: false, search: '',
  });
  const [claimedPieces, setClaimedPieces] = useState(new Set());
  const [claimOverlay, setClaimOverlay] = useState(null);

  const load = useCallback(async () => {
    try {
      const [res, awardsRes] = await Promise.all([
        apiFetch('/api/v1/challenges'),
        fetchTeamAwards().catch(() => []) // Handle case gracefully if no team or unauthenticated
      ]);
      
      // Check if we got HTML instead of JSON (typical for redirects to login)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const text = await res.text();
        console.error('API returned HTML instead of JSON!', {
          status: res.status,
          url: res.url,
          preview: text.substring(0, 200)
        });
        setError(`🔒 Session issue (HTTP ${res.status}). Please try to logout and login again.`);
        setLoading(false);
        return;
      }

      if (res.status === 403) {
        setError('🔒 Event not started yet — challenges are not visible to participants.');
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setChallenges(json.data ?? []);
      
      const claimedIds = new Set(
        awardsRes.filter(a => a.category === 'puzzle').map(a => parseInt(a.name.replace('puzzle_piece_', '')))
      );
      setClaimedPieces(claimedIds);
      
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 30s polling for wave releases
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const handleSolve = useCallback((challengeId, wasFirstBlood) => {
    setChallenges(prev =>
      prev.map(c => c.id === challengeId ? { ...c, solved_by_me: true } : c)
    );
    if (wasFirstBlood) {
      setFirstBloods(prev => new Set([...prev, challengeId]));
      setChallenges(prev => {
        const ch = prev.find(c => c.id === challengeId);
        if (ch) setFirstBloodAnnounce(ch);
        return prev;
      });
    }
    // Reload all challenges to get recalculated dynamic values
    setTimeout(() => load(), 500);
  }, [load]);

  const handleClaim = useCallback(async (challenge) => {
    await claimPuzzlePiece(challenge.id);
    setClaimedPieces(prev => new Set([...prev, challenge.id]));
    setClaimOverlay(challenge);
    setTimeout(() => {
      setClaimOverlay(null);
    }, 1500);
  }, []);

  // --- Filter logic ---
  const visible = challenges.filter(c => {
    if (filters.category !== 'All' && c.category !== filters.category) return false;
    if (filters.difficulty !== 'All') {
      const d = String(c.difficulty || '').toLowerCase();
      if (filters.difficulty === 'Easy' && !d.includes('easy')) return false;
      if (filters.difficulty === 'Medium' && !d.includes('med')) return false;
      if (filters.difficulty === 'Hard' && !d.includes('hard')) return false;
      if (filters.difficulty === 'Insane' && !d.includes('insane')) return false;
    }
    if (filters.hideSolved && c.solved_by_me) return false;
    if (filters.search && !c.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const solved = challenges.filter(c => c.solved_by_me).length;

  if (loading) return (
    <div className="center-screen animate-flicker" style={{ minHeight: '80vh' }}>
      <h2 className="text-display text-dim" style={{ letterSpacing: '6px' }}>
        SCANNING<span className="loading-dots"> </span>
      </h2>
    </div>
  );

  if (error) return (
    <div className="page-wrapper">
      <div className="center-screen">
        <div className="alert alert-error">[!] {error}</div>
      </div>
    </div>
  );

  return (
    <div className="page-wrapper">

      {/* First Blood Overlay */}
      {firstBloodAnnounce && (
        <FirstBloodOverlay
          challenge={firstBloodAnnounce}
          onClose={() => setFirstBloodAnnounce(null)}
        />
      )}

      {/* Full-screen Claim Overlay */}
      {claimOverlay && (
        <div className="claim-overlay">
          <div className="claim-overlay-content">
            <div className="claim-overlay-piece">
              {/* PUZZLE MAPPING — verify challenge IDs before event day.
                  piece_${claimOverlay.id}.png assumes challenge ID === piece number.
                  Run: docker-compose exec ctfd python check_puzzle_mapping.py */}
              <img src={`/puzzle/piece_${claimOverlay.id}.png`} alt={`Piece ${claimOverlay.id}`} />
            </div>
            <h2 className="text-display text-green claim-overlay-text">
              FRAGMENT SECURED &mdash; SIGNAL RECONSTRUCTED
            </h2>
          </div>
        </div>
      )}

      {/* Challenge Detail Modal */}
      {selected && (
        <ChallengeModal
          challenge={selected}
          isFirstBlood={firstBloods.has(selected.id)}
          onClose={() => setSelected(null)}
          onSolve={handleSolve}
        />
      )}

      <div className="container" style={{ paddingTop: '2rem', paddingBottom: '4rem' }}>
        {/* Page header */}
        <div className="mb-lg">
          <h1 className="text-display" style={{ fontSize: '1.4rem', letterSpacing: '5px' }}>
            SIGNAL FRAGMENTS
          </h1>
          <p className="text-dim text-xs text-upper mt-sm" style={{ letterSpacing: '2px' }}>
            {challenges.length} signals detected &mdash; {solved} captured
          </p>
        </div>

        <FilterBar challenges={challenges} filters={filters} onChange={setFilters} />

        {visible.length === 0 ? (
          <div className="center-screen" style={{ minHeight: '30vh' }}>
            <p className="text-dim text-sm">[!] No signals match your filters.</p>
          </div>
        ) : (
          <div className="challenge-grid">
            {visible.map(c => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                onSelect={setSelected}
                isFirstBlood={firstBloods.has(c.id)}
                isClaimed={claimedPieces.has(c.id)}
                onClaim={handleClaim}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
