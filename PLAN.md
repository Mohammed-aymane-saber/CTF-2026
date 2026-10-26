# Eclipse CTF : plan de refonte

Ce document explique ce que nous faisons sur ce dépôt, pourquoi, et comment contribuer sans casser la plateforme.

## 1. Contexte

L'édition précédente de la plateforme tournait sur une version ancienne de CTFd (3.8.2) avec du code personnalisé, et nous avons des raisons de penser qu'elle a été compromise. Nous repartons donc d'un **dépôt neuf**, sans historique, sans secrets et sans données de l'ancien projet.

## 2. Objectif

**Changer le design, pas les fonctionnalités.**

Les joueurs doivent retrouver exactement les mêmes fonctions : connexion, liste des challenges, soumission de flags, scoreboard, page d'équipe, animation de First Blood. Ce qui change :

- un nouveau design du frontend ;
- la suppression de la fonctionnalité "puzzle" ;
- une plateforme plus sûre (CTFd à jour, admin non exposé, configuration durcie).

### Hors périmètre

- Modifier le code de CTFd (`CTF/`).
- Ajouter des fonctionnalités de jeu.
- Installer des plugins tiers.

## 3. Architecture

```
Navigateur
    │
    ▼
Nginx public (liste blanche de routes)
    ├── /api/v1/...        → CTFd (routes de lecture + soumission de flag uniquement)
    ├── /api-auth/login    → CTFd /login   (avec limite de débit)
    └── /*                 → Frontend React (fichiers statiques)

Administrateur ──► accès privé (SSM / tunnel local) ──► Nginx admin (127.0.0.1) ──► CTFd /admin
```

| Dossier | Contenu |
|---|---|
| `CTF/` | CTFd **3.8.9** officiel. **Ne pas modifier.** |
| `frontend/` | SPA React 18 + Vite : l'interface des joueurs. |
| `nginx/` | Configurations public et admin (à venir). |
| `docker-compose.yml` | Orchestration de production à la racine (à venir). Celui de `CTF/` reste une référence. |

Le frontend et CTFd partagent le même domaine via Nginx : pas de CORS, et le cookie de session CTFd reste de même origine. L'authentification, le scoring et les règles du jeu restent **entièrement gérés par CTFd**.

## 4. Ce qui change et ce qui ne change pas

| Sujet | Décision |
|---|---|
| Authentification, CSRF, session | Inchangé (géré par CTFd) |
| Soumission de flags, scoring, First Blood | Inchangé |
| Scoreboard, équipes | Inchangé |
| Design (CSS, composants visuels) | **Refait** |
| Puzzle (plugin, `/api/v1/puzzle/claim`, images `piece_*.png`) | **Supprimé** |
| Admin CTFd | Inchangé, mais **inaccessible depuis Internet** |
| Polices Google Fonts | Hébergées localement |
| Description des challenges (HTML) | Assainie avec DOMPurify |

## 5. Plan par phases

Une branche par phase, une pull request par branche, relue avant fusion dans `main`.

| Phase | Branche | Contenu | Statut |
|---|---|---|---|
| 0 | n/a | Audit du dépôt neuf, CTFd 3.8.9 vérifié | Fait |
| 1 | `phase-1-lockfile` | `package-lock.json`, mise à jour de Vite et React Router (correctifs `npm audit`) | Fait |
| 2 | `phase-2-remove-puzzle` | Retrait du puzzle dans le frontend | Fait |
| 3 | `phase-3-frontend-hardening` | DOMPurify, polices locales, Node LTS, `npm ci`, ESLint | En cours |
| 4 | `phase-4-nginx-split` | `public.conf` (liste blanche) et `admin.conf` (local uniquement) | À faire |
| 5 | `phase-5-docker` | Compose de production, workers, secrets, test de charge | À faire |
| 6 | `phase-6-ci` | GitHub Actions : lint, audit, gitleaks, Trivy, Dependabot | À faire |
| 7 | `phase-7-redesign` | Nouveau design du frontend | À faire |
| 8 | `phase-8-aws` | Infrastructure AWS (Terraform) | Plus tard |

Le redesign (phase 7) vient après le durcissement : on évite de redessiner une interface sur une base que l'on va encore modifier.

### Phase 2 : retrait du puzzle

À supprimer ou à nettoyer :

- `frontend/public/puzzle/`
- `claimPuzzlePiece` et les appels à `/api/v1/puzzle/claim` dans `src/api.js`
- les références à `puzzle_piece_<id>` et `piece_<id>.png` dans `Challenges.jsx`, `Team.jsx`, `Congratulations.jsx`, `ChallengeModal.jsx`

Critère de réussite : `grep -ri "puzzle\|piece" frontend/src` ne retourne rien, et `npm run build` passe.

### Phase 4 : séparation public / admin

L'admin de CTFd utilise la même API que les joueurs. Bloquer seulement `/admin` ne suffit donc pas. Il y a **deux points d'entrée** vers le même CTFd :

- **public** : liste blanche stricte de routes et de méthodes, `/admin` et `/setup` répondent 404, limites de débit sur le login et les flags.
- **admin** : écoute sur `127.0.0.1` seulement, accessible via un tunnel (AWS SSM port forwarding), jamais ouvert dans un Security Group.

La liste blanche est dérivée des appels réels de `frontend/src/api.js`. **Si vous ajoutez un appel API au frontend, il faut aussi l'ajouter à la liste blanche, dans la même PR.**

### Phase 7 : redesign

À renseigner avant de commencer :

- direction visuelle : _à définir (références, ambiance, couleurs, logo de l'école)_
- pages concernées : landing, login, challenges, modale, scoreboard, équipe, félicitations
- contraintes : responsive, accessibilité de base (contrastes, navigation clavier), pas de ressource externe (polices, CDN, images distantes)

## 6. Règles pour les contributeurs

### Sécurité

- **Aucun secret dans Git.** Les secrets vivent dans `.env` (ignoré). Seul `.env.example` avec des placeholders est versionné.
- Ne jamais committer : `.env`, `*.db`, `*.sql`, `*.log`, clés, dumps, uploads.
- Ne pas monter `docker.sock` dans un conteneur.
- Ne pas modifier `CTF/`. Une personnalisation passe par la configuration, les variables d'environnement ou un thème/plugin séparé, validé par l'équipe.
- Pas de nouvelle dépendance sans en discuter. Pas de script ou de ressource chargé depuis un domaine externe.
- Ne pas copier de fichiers de l'ancien projet.
- Générer les secrets avec `openssl rand -hex 32`.

### Git

- `main` est protégée : pas de push direct.
- Une branche par tâche : `phase-N-description` ou `feat/...`, `fix/...`.
- Messages de commit conventionnels : `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Une PR relue par au moins une autre personne avant fusion.
- Les changements de design et les changements de sécurité ne se mélangent pas dans la même PR.

### Frontend

- Les appels API utilisent uniquement des **URLs relatives** (`/api/v1/...`).
- Le CSRF et l'authentification passent par `src/api.js`, ne les contourner nulle part.
- Tout HTML provenant de CTFd est assaini avant affichage.
- Le lockfile est versionné. Utiliser `npm ci` pour installer, `npm install` seulement pour changer une dépendance.
- Avant chaque PR : `npm run lint` et `npm run build` doivent passer.

## 7. Lancer le frontend en local

Prérequis : Node 22 LTS.

```bash
cd frontend
npm ci
npm run dev
```

Le serveur de développement écoute sur `localhost` uniquement. **Ne pas utiliser `--host`** sur un réseau partagé.

Le lancement complet (CTFd, base, cache, Nginx) sera documenté dans le `README.md` à la fin de la phase 5.

## 8. Définition de "terminé" pour une PR

- [ ] Le build passe (`npm run build`).
- [ ] Le linter passe.
- [ ] Les fonctionnalités existantes marchent : login, challenges, soumission de flag, scoreboard, équipe.
- [ ] Aucun secret ni fichier sensible dans le diff.
- [ ] Aucun appel API nouveau sans mise à jour de la liste blanche Nginx.
- [ ] La documentation est à jour si le comportement change.

## 9. Avant l'événement

- [ ] Nouveaux secrets générés, mot de passe admin long et unique.
- [ ] Admin inaccessible depuis Internet (vérifié depuis l'extérieur).
- [ ] HTTPS actif, WAF et limites de débit en place.
- [ ] Test de charge réalisé avec le nombre de joueurs attendu.
- [ ] Sauvegarde de la base testée (restauration comprise).
- [ ] Challenges isolés du réseau de CTFd et de la base.
- [ ] Flags des anciens challenges changés.
- [ ] Journalisation active et quelqu'un chargé de la surveiller pendant l'événement.

## 10. Contacts et rôles

| Rôle | Personne |
|---|---|
| Responsable du dépôt | _à renseigner_ |
| Frontend / design | _à renseigner_ |
| Infrastructure / sécurité | _à renseigner_ |
| Challenges | _à renseigner_ |
