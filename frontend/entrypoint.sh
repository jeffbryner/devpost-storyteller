#!/bin/sh
set -e

# Generate runtime config.js from template, substituting environment variables.
# Default API_BASE_URL to empty string so local fallback in config.ts kicks in.
export API_BASE_URL="${API_BASE_URL:-}"
envsubst < /usr/share/nginx/html/config.js.template > /usr/share/nginx/html/config.js

# Start nginx
exec nginx -g 'daemon off;'
