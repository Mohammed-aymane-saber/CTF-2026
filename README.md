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

### MFA administrateur (TOTP)

Le plugin `CTF/CTFd/plugins/admin_mfa/` impose un second facteur (code à 6 chiffres d'une application d'authentification) à tout compte admin, avant toute page `/admin` ou appel `/api/v1`. Les joueurs ne sont pas concernés.

- **Premier login admin :** redirection vers `/admin-mfa/setup` (QR code + clé manuelle), puis affichage unique de 10 codes de récupération.
- **Logins suivants :** code demandé sur `/admin-mfa/verify` (10 essais / 5 min / IP).
- **Jetons API admin :** refusés (403). Les jetons des joueurs fonctionnent toujours.
- **Clé de chiffrement :** définir `ADMIN_MFA_ENCRYPTION_KEY` en production :
  ```bash
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```
  Sans elle, une clé est dérivée de `SECRET_KEY` (HKDF) et un avertissement est journalisé. Changer la clé rend les enrôlements existants illisibles : il faut alors réinitialiser les admins.
- **Téléphone perdu :** `docker compose exec ctfd python manage.py admin-mfa-reset <email>`. L'admin se réenrôle au prochain login.
- L'horloge du serveur doit être synchronisée (NTP) : la tolérance n'est que de ±30 s.
- Ne jamais activer `SAFE_MODE` en production : il désactive tous les plugins, y compris celui-ci.
- `/admin-mfa/*` doit rester derrière l'accès admin privé, jamais dans la liste blanche du Nginx public.

### Accès admin restreint (Nginx)

Nginx (`CTF/conf/nginx/http.conf.template`) ne laisse passer `/admin`, `/admin-mfa` et toute l'API admin qu'aux clients qui remplissent **deux conditions** :

1. **Réseau autorisé :** l'IP du client figure dans `CTF/conf/nginx/admin-allow.conf` (Tailscale, IP fixes…).
2. **Cookie « knock » :** obtenu en visitant `http://<hôte>/<ADMIN_KNOCK_SECRET>` depuis un réseau autorisé. Le cookie est valable 12 h.

Tous les autres reçoivent un **404**, comme si le panneau n'existait pas. Le login CTFd et la MFA s'appliquent ensuite.

**API publique (joueurs) :** seules les routes appelées par le frontend React sont ouvertes à tous :
- `GET /api/v1/challenges`, `/challenges/<id>`, `/challenges/<id>/solves`
- `POST /api/v1/challenges/attempt`
- `GET /api/v1/scoreboard`
- `GET /api/v1/teams/me`, `/teams/me/solves`
- `GET /api/v1/users/me`, `/users/<id>`

Toute autre route ou méthode `/api/v1` est réservée aux clients admin. Si le frontend utilise une nouvelle route, l'ajouter dans la `map $public_api`.

**Mise en place (fichiers git-ignorés, jamais commités) :**

```bash
cd CTF
python3 -c "import secrets; print('ADMIN_KNOCK_SECRET=' + secrets.token_urlsafe(32))" > conf/nginx/admin-knock.env
cp conf/nginx/admin-allow.conf.example conf/nginx/admin-allow.conf   # puis l'adapter
docker compose up -d --force-recreate nginx
```

- Sans secret valide (24 à 128 caractères `A-Z a-z 0-9 _ -`) ou sans liste d'accès, Nginx **refuse de démarrer** (`FATAL:` dans `docker compose logs nginx`).
- Après chaque modification de ces fichiers ou du template : `docker compose up -d --force-recreate nginx` (un simple reload ne suffit pas).
- Vérifier les règles : `CTF/scripts/check-nginx-access.sh` (la CI l'exécute aussi).
- Le port 8000 (CTFd direct, sans Nginx) n'écoute que sur `127.0.0.1`.

Le déploiement complet, la séparation public/admin et l'orchestration de production seront documentés dans les phases suivantes.
