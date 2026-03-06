#!/bin/sh
set -e

# Generate runtime config.js from template, substituting environment variables.
# Default API_BASE_URL to empty string so local fallback in config.ts kicks in.
export API_BASE_URL="${API_BASE_URL:-}"
envsubst < /usr/share/nginx/html/config.js.template > /usr/share/nginx/html/config.js

echo "Generated config.js with API_BASE_URL=${API_BASE_URL}"

# Delegate to the official nginx entrypoint which handles
# /etc/nginx/templates/*.template processing (e.g. PORT substitution)
exec /docker-entrypoint.sh nginx -g 'daemon off;'
