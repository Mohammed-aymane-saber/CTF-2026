# Stage 1: Build React + Vite app
FROM node:22.14.0-alpine3.21 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx (with correct MIME types)
FROM nginx:1.27.4-alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Inline Nginx config: SPA fallback + proper MIME types + cache headers
RUN printf '\
server {\n\
    listen 80;\n\
    root /usr/share/nginx/html;\n\
    index index.html;\n\
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
    location ^~ /files {\n\
        proxy_pass http://ctfd:8000;\n\
        proxy_http_version 1.1;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
        proxy_redirect off;\n\
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

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
