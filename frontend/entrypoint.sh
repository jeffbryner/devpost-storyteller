#!/bin/sh
# This script is placed in /docker-entrypoint.d/ and is automatically
# executed by nginx's docker-entrypoint.sh at container startup.
# It generates config.js from the template using environment variables.

set -e

export API_BASE_URL="${API_BASE_URL:-}"
envsubst < /usr/share/nginx/html/config.js.template > /usr/share/nginx/html/config.js

echo "entrypoint.sh: Generated config.js with API_BASE_URL='${API_BASE_URL}'"
