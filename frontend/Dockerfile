# Stage 1: Build React + Vite app
FROM node:22.14.0-alpine3.21 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx (with correct MIME types)
FROM nginx:1.31.8-alpine3.24

# The image setup runs as root; the final Nginx process does not.
USER root

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Relocate the PID file and prepare runtime paths for the unprivileged user.
RUN sed -i 's#^pid .*$#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && sed -i 's#^error_log .*$#error_log /dev/stderr warn;#' /etc/nginx/nginx.conf \
    && sed -i '/^user /d' /etc/nginx/nginx.conf \
    && mkdir -p /var/cache/nginx /var/log/nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /usr/share/nginx/html

# Inline Nginx config: SPA fallback + proper MIME types + cache headers
RUN printf '\
server {\n\
    listen 8080;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
\n\
    server_tokens off;\n\
    proxy_hide_header Server;\n\
\n\
    add_header X-Frame-Options "DENY" always;\n\
    add_header X-Content-Type-Options "nosniff" always;\n\
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n\
    add_header Content-Security-Policy "default-src '"'"'self'"'"'; frame-ancestors '"'"'none'"'"'" always;\n\
\n\
    # Serve static assets with correct MIME types and long cache\n\
    location ~* \\.(?:js|mjs)$ {\n\
        add_header Content-Type "application/javascript; charset=utf-8";\n\
        add_header Cache-Control "public, max-age=31536000, immutable";\n\
        try_files $uri =404;\n\
    }\n\
\n\
    location ~* \\.css$ {\n\
        add_header Content-Type "text/css; charset=utf-8";\n\
        add_header Cache-Control "public, max-age=31536000, immutable";\n\
        try_files $uri =404;\n\
    }\n\
\n\
    location ~* \\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf)$ {\n\
        add_header Cache-Control "public, max-age=86400";\n\
        try_files $uri =404;\n\
    }\n\
\n\
    # SPA fallback — all other routes serve index.html\n\
    # Challenge files must always reach CTFd; never let the SPA fallback\n\
    # replace a file response with index.html.\n\
    location = /files {\n\
        proxy_pass http://ctfd:8000;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
        proxy_redirect off;\n\
    }\n\
\n\
    location ^~ /files/ {\n\
        proxy_pass http://ctfd:8000;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
        proxy_redirect off;\n\
    }\n\
\n\
    location ^~ /api/ {\n\
        proxy_pass http://ctfd:8000;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
\n\
    location ^~ /api-auth/ {\n\
        proxy_pass http://ctfd:8000/;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
\n\
    location ^~ /themes/ {\n\
        proxy_pass http://ctfd:8000;\n\
        proxy_set_header Host $host;\n\
    }\n\
\n\
    location ^~ /events {\n\
        proxy_pass http://ctfd:8000;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Connection "";\n\
        proxy_buffering off;\n\
        proxy_cache off;\n\
        proxy_set_header Host $host;\n\
    }\n\
\n\
    location / {\n\
        try_files $uri $uri/ /index.html;\n\
        add_header Cache-Control "no-cache";\n\
    }\n\
}\n\
' > /etc/nginx/conf.d/default.conf

# Wipe default assets and copy built app
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html

USER nginx

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

ENTRYPOINT []
CMD ["nginx", "-g", "daemon off;"]
