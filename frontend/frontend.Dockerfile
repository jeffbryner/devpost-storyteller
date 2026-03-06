# Stage 1: Build the application
FROM node:22-alpine AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and build
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:stable-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy the runtime config template (envsubst fills it at startup)
COPY config.js.template /usr/share/nginx/html/config.js.template

# Copy nginx config template (nginx docker image auto-substitutes env vars
# from /etc/nginx/templates/*.template into /etc/nginx/conf.d/ at startup)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Copy entrypoint script that generates config.js then starts nginx
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080
# Default API_BASE_URL is empty — frontend config.ts falls back to localhost for local dev
ENV API_BASE_URL=""

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
