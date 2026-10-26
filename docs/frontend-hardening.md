# Frontend : correspondance du proxy

Le proxy Vite de développement et la configuration Nginx de production doivent conserver les mêmes correspondances d'URL :

| URL frontend | Cible CTFd |
|---|---|
| `/api-auth/login` | `/login` |
| `/api-auth/logout` | `/logout` |
| `/api/...` | `/api/...` |
| `/files/...` | `/files/...` |
| `/themes/...` | `/themes/...` |
| `/events` | `/events` |

Le mapping `/api-auth/login` vers `/login` et `/api-auth/logout` vers `/logout` doit rester identique dans `frontend/vite.config.js` et dans la future configuration `nginx/public.conf`.

Les routes `/api-auth` servent à préserver les routes React du frontend tout en conservant le flux d'authentification form-urlencoded et le cookie de session CTFd.
