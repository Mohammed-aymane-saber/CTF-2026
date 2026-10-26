# ECLIPSE Frontend Developer Guide

Welcome to the ECLIPSE project. This repository contains a customized React + Vite frontend that sits on top of a hidden CTFd backend. 

This guide will help you install, run, and understand the current state of the application so you can start developing immediately.

---

## 🚀 Quick Start: How to Run the App

Because this is a decoupled architecture, React and CTFd must run together inside the pre-configured Docker network. 

### 1. Start the Environment
Everything is containerized. To spin up the frontend, backend, database, and proxy seamlessly, run:
```bash
cd eclipse/CTFd
docker-compose up --build
```

### 2. Initialization & Setup (What to Expect)
When firing this up for the very first time (or after wiping your `.data` volume), the database goes into a fresh state. Here is the exact sequence you will follow to launch the app:

1. **Go to `http://localhost/setup`**: This bypasses React entirely and opens the native CTFd setup wizard. Create your Admin account and configure the CTF (Make sure to select **Team Mode** if prompted).
2. **Go to `http://localhost/login`**: You will now see our customized Green Terminal React UI! 
3. **Log in or Register**: Registering a new standard user will dynamically authenticate you with the CTFd backend seamlessly via our API utilities.
4. **The Team Portal**: Because CTFd is in Team Mode, new users are blocked from seeing challenges until they join a team. The React app is programmed to intercept this block and push you to the `Team.jsx` dashboard. 

---

## 🛠️ Active Development Focus: Phase 2 (Team Alignment)

**Your immediate target is the `src/Team.jsx` component.** 
Right now, it is just a placeholder screen. Signal Hunters are stuck here until they can join a team. 

**Your tasks:**
- Build the UI forms inside `Team.jsx` to allow users to either create a new team or enter a token to join an existing one.
- Use `apiFetch('/api/v1/teams')` or `/api/v1/teams/join` to submit the data.
- Upon a successful `200 OK` response, execute a React Router `navigate('/')` to bounce the user into the unlocked Signal Fragments dashboard.

---

## 🏗️ Technical Architecture & Rules (Must Read)

Before you write `fetch()` calls or modify routing, understand these three critical rules:

### 1. Nginx Routing Boundaries
- **`http://localhost/`**: The Nginx proxy routes standard traffic directly to this React container.
- Specific API patterns (`/api/v1/...`) are secretly rerouted to the Python backend.
- **`/setup` and `/admin`**: Bypass React entirely to mount the native backend dashboard modules.
- **IMPORTANT**: If creating or modifying authentication flows, always target `/api-auth/login` or `/api-auth/register`. Nginx translates this prefix specifically to prevent React Router collisions.

### 2. The `api.js` Utility (Do NOT use standard `fetch`)
CTFd enforces brutal CSRF (Cross-Site Request Forgery) token validation protocols.
If you use standard `fetch`, you will get a `403 Forbidden` error.

Instead, import and use our custom wrappers inside `src/api.js`:
- **`apiFetch(endpoint, options)`**: Use this for all `/api/v1/...` REST operations. It automatically manages cookies and injects the necessary CSRF headers. 
- **`loginHunter` / `registerHunter`**: CTFd refuses JSON for authentication. It requires strictly formatted `application/x-www-form-urlencoded` shapes. These functions gracefully serialize your payloads and inject the `nonce` dynamically. 

### 3. ECLIPSE Lore & Terminology
We are not building a generic CTF. Every piece of UI text **must** adhere consistently to the lore. DO NOT use default CTFd terminology!

| CTFd Backend Name | ECLIPSE Frontend Name |
| --- | --- |
| Challenges | Signal Fragments |
| Points | Signal Strength |
| Leaderboard | Transmission Ranking |
| Players / Users | Signal Hunters |
| Teams | Sync Squads |

- **Aesthetics**: Exclusively leverage the CSS Variables in `src/index.css`. Maintain the **Deep Black (`#0A0A0A`)** and **Bright Green (`#00FF66`)** CRT Terminal aesthetic. Use sharp corners and the `JetBrains Mono` typography.
