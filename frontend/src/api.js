let csrfNonce = null;
let cachedMe = null; // cached current user for first-blood checks

/**
 * Initializes the API by fetching the CSRF nonce from the backend.
 * Uses GET /login to retrieve a backend-rendered page, then searches for
 * the nonce either in the `init` JavaScript object or a `<meta>` tag.
 */
export async function fetchCsrfNonce() {
  try {
    // Use the login page to scrape the CSRF nonce from window.init.csrfNonce
    // (reset_password is permanently disabled for security)
    const response = await fetch(`/api-auth/login?_t=${Date.now()}`, { 
      credentials: 'same-origin',
      cache: 'no-cache'
    });
    const htmlText = await response.text();

    // 1. Primary Source: look for window.init = {..., "csrfNonce": "..."};
    // We use a regex to extract the init object if possible.
    const initMatch = htmlText.match(/window\.init\s*=\s*(\{.*?\});/s);
    if (initMatch && initMatch[1]) {
      try {
        const initObj = JSON.parse(initMatch[1]);
        if (initObj.csrfNonce) {
          csrfNonce = initObj.csrfNonce;
          console.log('CSRF Nonce injected via init object');
          return;
        }
      } catch (err) {
         console.warn('Failed to parse init object JSON', err);
      }
    }

    // 2. Fallback: look for meta tag: <meta name="csrf-nonce" content="...">
    const metaMatch = htmlText.match(/<meta\s+name="csrf-nonce"\s+content="([^"]+)"/i);
    if (metaMatch && metaMatch[1]) {
      csrfNonce = metaMatch[1];
      console.log('CSRF Nonce injected via meta tag');
      return;
    }

    // 3. CTFd 3.x+ alternative single quotes or value extraction
    const jsMatch = htmlText.match(/['"]?csrfNonce['"]?\s*:\s*['"]([^'"]+)['"]/);
    if (jsMatch && jsMatch[1]) {
        csrfNonce = jsMatch[1];
        console.log('CSRF Nonce extracted via regex match directly on JS block');
        return;
    }

    console.error('CRITICAL: Could not locate CSRF nonce in /login HTML response!');
  } catch (error) {
    console.error('Failed to fetch the login page for CSRF extraction', error);
  }
}

/**
 * Enhanced fetch wrapper that:
 * 1. Automatically attaches the CSRF nonce header to mutating methods.
 * 2. Follows redirects.
 */
export async function apiFetch(endpoint, options = {}) {
  const mergedOptions = { ...options };
  mergedOptions.headers = { ...mergedOptions.headers };

  // Always attach CSRF nonce for POST, PATCH, DELETE 
  if (['POST', 'PATCH', 'DELETE'].includes(mergedOptions.method?.toUpperCase())) {
    if (csrfNonce) {
      mergedOptions.headers['CSRF-Token'] = csrfNonce;
    } else {
      console.warn('apiFetch warning: Performing mutating request without CSRF Nonce!');
    }
  }

  // Ensure requests can follow the redirect tracking logic and preserve cookies natively
  mergedOptions.redirect = 'follow';
  mergedOptions.credentials = 'same-origin';

  return fetch(endpoint, mergedOptions);
}

/**
 * Standard utility for auth endpoints relying on Form Encoding.
 * Automatically injects the CSRF nonce into the form body as expected by CTFd 
 * for non-JSON POST requests!
 */
function encodeForm(data) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value) params.append(key, value);
  }
  if (csrfNonce) {
    params.append('nonce', csrfNonce);
  }
  return params;
}

/**
 * Attempts to login a Signal Hunter.
 * Expects exactly { name, password }. Uses Form Encoding instead of JSON.
 */
export async function loginHunter(credentials) {
  await fetchCsrfNonce(); // Ensure state sync for edge cases where active sessions block
  const body = encodeForm(credentials);
  const response = await apiFetch('/api-auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body
  });

  // Since we follow redirects automatically, CTFd returns us to /challenges or similar on success.
  // If the final URL ends with /login, it failed.
  if (response.url.endsWith('/login')) {
    throw new Error('SIGNAL REJECTED \u2014 INVALID CREDENTIALS');
  }

  // Refresh CSRF nonce because session ID changed on successful login
  await fetchCsrfNonce();

  return response;
}


/**
 * Logs out the active session. The backend handles cookie clearing.
 */
export async function logoutHunter() {
  await fetch('/api-auth/logout', { method: 'GET', redirect: 'follow', credentials: 'same-origin' });
  csrfNonce = null;
  cachedMe = null; // clear user cache on logout
  await fetchCsrfNonce();
}

/**
 * Checks if the current session is authenticated.
 */
export async function checkAuth() {
  try {
    const res = await apiFetch('/api/v1/users/me');
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || ct.includes('text/html')) return false;
    const json = await res.json();
    cachedMe = json.data; // cache while we're at it

    // Restore CSRF token in memory if it was lost (e.g. page refresh)
    if (!csrfNonce) {
      await fetchCsrfNonce();
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the current user (cached after first call).
 */
export async function getMe() {
  if (cachedMe) return cachedMe;
  const res = await apiFetch('/api/v1/users/me');
  if (!res.ok) return null;
  const json = await res.json();
  cachedMe = json.data;
  return cachedMe;
}

/** Fetch all visible challenges. */
export async function fetchChallenges() {
  const res = await apiFetch('/api/v1/challenges');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

/** Fetch full detail for one challenge (description, solve count). */
export async function fetchChallengeDetail(id) {
  const res = await apiFetch(`/api/v1/challenges/${id}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

/**
 * Submit a flag.
 * Returns { status: 'correct'|'incorrect'|'already_solved'|'ratelimited', message }
 */
export async function submitFlag(challengeId, submission) {
  const res = await apiFetch('/api/v1/challenges/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId, submission }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

/**
 * Fetch the first solve entry for a challenge.
 * Used post-submission to check first blood.
 * Returns the first solve object { account_id, name, date } or null.
 */
export async function fetchFirstSolve(challengeId) {
  const res = await apiFetch(`/api/v1/challenges/${challengeId}/solves`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.data?.[0] ?? null;
}

/**
 * Fetch the scoreboard top 100
 */
export async function fetchScoreboard() {
  const res = await apiFetch('/api/v1/scoreboard');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  // Depending on CTFd version, it might be json.data or an object
  return json.data ?? [];
}

/**
 * Fetch the current user's team data.
 */
export async function fetchTeamData() {
  const res = await apiFetch('/api/v1/teams/me');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data;
}

/**
 * Fetch the current user's team solves.
 */
export async function fetchTeamSolves() {
  const res = await apiFetch('/api/v1/teams/me/solves');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

/**
 * Fetch the current user's team awards.
 */
export async function fetchTeamAwards() {
  const res = await apiFetch('/api/v1/teams/me/awards');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

/**
 * Claim a puzzle piece.
 */
export async function claimPuzzlePiece(challengeId) {
  const res = await apiFetch('/api/v1/puzzle/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge_id: challengeId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  if (!json.success) throw new Error(json.message || 'Claim failed');
  return json;
}
