# ---- Build Stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files
COPY package.json bun.lock* package-lock.json* ./

# Install dependencies
RUN npm install --frozen-lockfile 2>/dev/null || npm install

# Copy source
COPY . .

# Build
RUN npm run build

# ---- Production Stage ----
FROM nginx:alpine AS production

# Copy custom nginx config for SPA
COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback config
RUN echo 'server { \
    listen 80; \
    listen [::]:80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    \
    # Gzip \
    gzip on; \
    gzip_vary on; \
    gzip_proxied any; \
    gzip_comp_level 6; \
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml; \
    \
    # Cache static assets \
    location /assets/ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
    \
    # Service worker - no cache \
    location /sw.js { \
        add_header Cache-Control "no-cache, no-store, must-revalidate"; \
    } \
    \
    # SPA fallback \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
