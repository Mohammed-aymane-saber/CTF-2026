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

Les appels API restent relatifs au domaine courant. Le proxy de développement est défini dans `frontend/vite.config.js`.

## Sécurité

- Aucun secret ne doit être commité ; utiliser `.env` localement.
- Le lockfile est versionné et les installations reproductibles utilisent `npm ci`.
- Le HTML provenant de CTFd est assaini avant rendu dans l'interface.
- Les polices du frontend sont embarquées localement.

Le déploiement complet, la séparation public/admin et l'orchestration de production seront documentés dans les phases suivantes.
