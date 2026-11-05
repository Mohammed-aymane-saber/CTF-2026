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
the CTFd containers, audits frontend production dependencies, scans the
repository and built images with Trivy, reviews dependency changes, runs an
OWASP ZAP baseline scan against the local CTFd environment, and scans the
repository for committed secrets. On pushes to `main`, it can publish the
`aymanesbe3/eclipse-ctfd` and `aymanesbe3/eclipse-frontend` images with both
`latest` and commit-SHA tags. Publishing uses the protected GitHub
`production` environment, so it can require an approval before images are
released. A manual `workflow_dispatch` promotion is also available from
`main`. Dependabot keeps npm, Python, and Actions dependencies up to date.

To enable publishing, add these secrets to the GitHub `production` environment
under **Settings → Environments → production → Environment secrets**:

- `DOCKERHUB_USERNAME`: `aymanesbe3`
- `DOCKERHUB_TOKEN`: a Docker Hub Personal Access Token with read/write access
  to the two repositories.

For production readiness, configure the `production` environment in GitHub
under **Settings → Environments**. Add required reviewers, restrict deployment
branches to `main`, and keep production-only secrets there rather than at the
repository level. Deploy a commit-SHA image tag or digest in production so a
deployment can be rolled back to the exact build that passed CI.

Les appels API restent relatifs au domaine courant. Le proxy de développement est défini dans `frontend/vite.config.js`.

## Sécurité

- Aucun secret ne doit être commité ; utiliser `.env` localement.
- Le lockfile est versionné et les installations reproductibles utilisent `npm ci`.
- Le HTML provenant de CTFd est assaini avant rendu dans l'interface.
- Les polices du frontend sont embarquées localement.

Le déploiement complet, la séparation public/admin et l'orchestration de production seront documentés dans les phases suivantes.
