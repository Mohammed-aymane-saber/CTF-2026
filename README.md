# Eclipse CTF

Plateforme CTF d'école composée de CTFd 3.8.9 et d'un frontend React/Vite.

## Frontend

Prérequis : Node.js 22 LTS ou supérieur.

```bash
cd frontend
npm ci
npm run lint
npm run build
npm run dev
```

## CI

Every pull request and every push to `main` runs the GitHub Actions workflow in
`.github/workflows/ci.yml`. It installs dependencies from the committed lockfiles,
checks the frontend with ESLint and Vite, runs the CTFd tests and Bandit, builds
the CTFd container, audits frontend production dependencies, and scans the
repository for committed secrets. On pushes to `main`, it publishes the
`aymanesbe3/eclipse-ctfd` and `aymanesbe3/eclipse-frontend` images with both
`latest` and commit-SHA tags. Dependabot keeps npm, Python, and Actions
dependencies up to date.

To enable publishing, add these repository secrets in GitHub under
**Settings → Secrets and variables → Actions**:

- `DOCKERHUB_USERNAME`: `aymanesbe3`
- `DOCKERHUB_TOKEN`: a Docker Hub Personal Access Token with read/write access
  to the two repositories.

Les appels API restent relatifs au domaine courant. Le proxy de développement est défini dans `frontend/vite.config.js`.

## Sécurité

- Aucun secret ne doit être commité ; utiliser `.env` localement.
- Le lockfile est versionné et les installations reproductibles utilisent `npm ci`.
- Le HTML provenant de CTFd est assaini avant rendu dans l'interface.
- Les polices du frontend sont embarquées localement.

Le déploiement complet, la séparation public/admin et l'orchestration de production seront documentés dans les phases suivantes.
