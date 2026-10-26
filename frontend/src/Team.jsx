import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTeamData, fetchTeamSolves, fetchChallenges, fetchTeamAwards, getMe, apiFetch } from './api';

export default function Team() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [me, setMe] = useState(null);
  
  const [pieces, setPieces] = useState([]);
  const [claimedCount, setClaimedCount] = useState(0);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        
        // Parallel data fetch
        const [meData, teamData, solvesData, challengesData, awardsData] = await Promise.all([
          getMe(),
          fetchTeamData().catch(e => {
            // If user has no team, this endpoint returns 404 or similar error.
            return null; 
          }),
          fetchTeamSolves().catch(() => []),
          fetchChallenges().catch(() => []),
          fetchTeamAwards().catch(() => [])
        ]);

        setMe(meData);

        if (!teamData) {
          // No team case handled here
          setTeam(null);
          setLoading(false);
          return;
        }

        setTeam(teamData);
        setCaptainId(teamData.captain_id);

        // Fetch real usernames for all team members in parallel.
        // Falls back to "HUNTER {id}" if any individual request fails — never crashes the page.
        const memberNameMap = {};
        if (teamData.members && teamData.members.length > 0) {
          const userFetches = teamData.members.map(async (memberId) => {
            try {
              const res = await apiFetch(`/api/v1/users/${memberId}`);
              if (res.ok) {
                const json = await res.json();
                return { id: memberId, name: json.data?.name || `HUNTER ${memberId}` };
              }
              return { id: memberId, name: `HUNTER ${memberId}` };
            } catch {
              return { id: memberId, name: `HUNTER ${memberId}` };
            }
          });
          const resolvedMembers = await Promise.all(userFetches);
          resolvedMembers.forEach(m => { memberNameMap[m.id] = m.name; });
        }

        // Calculate member solve counts
        // solvesData is an array of solve objects, usually { account_id, challenge_id, user: { name, id }, ... }
        // Depending on CTFd version, it might be nested under `user` or have `account_id` / `user_id`
        const solveCounts = {};
        
        // Initialize all members with 0, using real names resolved above
        if (teamData.members) {
           teamData.members.forEach(m => {
             solveCounts[m] = { id: m, count: 0, name: memberNameMap[m] || `HUNTER ${m}` };
           });
        }

        solvesData.forEach(solve => {
           // Standard CTFd response for team solves usually has a user object
           const userId = solve.user_id || (solve.user && solve.user.id) || solve.account_id;
           const userName = solve.user?.name || `Agent ${userId}`;
           
           if (userId) {
             if (!solveCounts[userId]) {
               solveCounts[userId] = { id: userId, count: 0, name: userName };
             }
             solveCounts[userId].count += 1;
             solveCounts[userId].name = userName; // ensure name is set
           }
        });
        
        // Convert to array and sort descending
        const memberList = Object.values(solveCounts).sort((a, b) => b.count - a.count);
        setMembers(memberList);

        // Process Puzzle Grid
        // 1. Filter awards for puzzle category
        const puzzleAwards = awardsData.filter(a => a.category === 'puzzle' || (a.name && a.name.startsWith('puzzle_piece_')));
        
        // 2. Map challenges to pieces (Sort by ID to ensure row-major order: 1-5, 6-10, etc.)
        let cCount = 0;
        const sortedChallenges = [...challengesData].sort((a, b) => a.id - b.id);
        const gridPieces = sortedChallenges.map(ch => {
          const isSolved = ch.solved_by_me;
          const awardName = `puzzle_piece_${ch.id}`;
          const hasAward = puzzleAwards.some(a => a.name === awardName);

          let state = 'locked';
          if (isSolved && hasAward) {
            state = 'claimed';
            cCount++;
          } else if (isSolved && !hasAward) {
            state = 'claimable';
          }

          return {
            id: ch.id,
            name: ch.name,
            state: state
          };
        });

        setClaimedCount(cCount);
        setPieces(gridPieces);
        setError(null);

      } catch (err) {
        console.error(err);
        setError('CRITICAL: CONNECTION TO SIGNAL CELL LOST.');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);


  if (loading) {
    return (
      <div className="page-wrapper">
        <div className="center-screen animate-flicker">
          <h2 className="text-display text-dim" style={{ letterSpacing: '6px' }}>
            SCANNING SIGNAL NETWORK<span className="loading-dots"> </span>
          </h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-wrapper">
        <div className="center-screen">
          <div className="alert alert-error">
            [!] {error}
          </div>
        </div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="page-wrapper">
        <div className="center-screen">
          <div className="panel animate-in" style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
            <h2 className="mb-md">NO ACTIVE SIGNAL CELL</h2>
            <div className="alert alert-info text-left">
              [!] INDIVIDUAL HUNTING PROHIBITED. A TEAM ALIGNMENT IS REQUIRED TO ACCESS SIGNAL FRAGMENTS.
            </div>
            <p className="text-dim mt-lg mb-lg">
              You must align with a team to synchronize your signals. Contact the game administrators or navigate to the team portal to join or create a cell.
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              &gt; Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <div className="container" style={{ padding: '2rem 1rem' }}>
        
        {/* Section 1 — Team Identity & Members */}
        <section className="team-identity-section mb-xl animate-in">
          <div className="panel" style={{ borderTop: '3px solid var(--clr-green)' }}>
            <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--clr-border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <h1 className="text-display" style={{ textShadow: '0 0 15px var(--clr-green-glow)' }}>
                {team.name}
              </h1>
              <div className="text-right">
                <span className="text-dim text-upper" style={{ fontSize: '0.8rem', letterSpacing: '2px', display: 'block' }}>Signal Strength</span>
                <span className="text-display text-cyan" style={{ fontSize: '2rem', textShadow: '0 0 10px var(--clr-cyan-glow)' }}>{team.score || 0}</span>
              </div>
            </div>

            <h3 className="text-dim text-upper mb-md" style={{ fontSize: '0.85rem' }}>Active Operators</h3>
            <ul className="member-list">
              {members.map(member => {
                const isMe = me && me.id === member.id;
                const isCaptain = member.id === captainId;
                
                return (
                  <li key={member.id} className={`member-item ${isMe ? 'is-me' : ''}`}>
                    <div className="member-name-area">
                      <span className="member-name" style={{ color: isMe ? 'var(--clr-green)' : 'var(--clr-text)' }}>
                        {member.name}
                      </span>
                      {isCaptain && <span className="badge badge-captain ml-sm">CAPTAIN</span>}
                      {isMe && <span className="text-dim text-xs ml-sm">(YOU)</span>}
                    </div>
                    <div className="member-solves text-right">
                      <span className="text-cyan">{member.count}</span> <span className="text-dim text-xs">FRAGMENTS</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Section 2 — Puzzle Grid */}
        <section className="puzzle-section animate-in" style={{ animationDelay: '0.1s' }}>
          <div className="panel">
            <div className="flex justify-between items-center mb-lg" style={{ borderBottom: '1px solid var(--clr-border)', paddingBottom: '1rem' }}>
              <h2 className="text-display" style={{ fontSize: '1.5rem' }}>SIGNAL RECONSTRUCTION</h2>
              <div className="progress-indicator text-right">
                <span className="text-display text-cyan" style={{ fontSize: '1.2rem', textShadow: '0 0 8px var(--clr-cyan-glow)' }}>
                  {claimedCount} / {pieces.length || 0}
                </span><br />
                <span className="text-dim text-xs text-upper" style={{ letterSpacing: '2px' }}>FRAGMENTS RECONSTRUCTED</span>
              </div>
            </div>

            {pieces.length > 0 && claimedCount === pieces.length && (
              <div className="completion-banner">
                <h2 className="text-display text-green mb-sm" style={{ fontSize: '2rem', textShadow: '0 0 15px var(--clr-green-glow)' }}>
                  SIGNAL RECONSTRUCTED &mdash; ECLIPSE PREVENTED
                </h2>
                <p className="text-dim text-upper" style={{ letterSpacing: '2px' }}>
                  YOUR TEAM HAS CAPTURED ALL SIGNAL FRAGMENTS
                </p>
                <button
                  className="btn-victory"
                  onClick={() => navigate('/congratulations')}
                >
                  CLAIM YOUR VICTORY &rarr;
                </button>
              </div>
            )}

            {pieces.length === 0 ? (
              <div className="text-center text-dim mt-xl mb-xl">NO FRAGMENTS DETECTED</div>
            ) : (
              <div className="puzzle-grid">
                {pieces.map(piece => (
                  <div key={piece.id} className={`puzzle-piece piece-${piece.state}`}>
                    {/* PUZZLE MAPPING — verify challenge IDs before event day.
                        piece_${piece.id}.png assumes challenge ID === piece number.
                        Run: docker-compose exec ctfd python check_puzzle_mapping.py */}
                    <img src={`/puzzle/piece_${piece.id}.png`} alt={`Piece ${piece.id}`} className="piece-image" />
                    {piece.state === 'claimed' && (
                      <div className="piece-content">
                        <span className="piece-id">#{piece.id}</span>
                      </div>
                    )}
                    {piece.state === 'claimable' && (
                      <div className="piece-content">
                        <span className="piece-ready">READY</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
