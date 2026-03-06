#!/bin/sh
# This script is placed in /docker-entrypoint.d/ and is automatically
# executed by nginx's docker-entrypoint.sh at container startup.
# It generates config.js from the template using environment variables.

set -e

export API_BASE_URL="${API_BASE_URL:-}"

echo "05-generate-config-js: Generating config.js..."
echo "05-generate-config-js: API_BASE_URL='${API_BASE_URL}'"
echo "05-generate-config-js: Template exists: $(ls -la /usr/share/nginx/html/config.js.template 2>&1)"

envsubst < /usr/share/nginx/html/config.js.template > /usr/share/nginx/html/config.js

echo "05-generate-config-js: Generated config.js:"
cat /usr/share/nginx/html/config.js
echo "05-generate-config-js: File listing:"
ls -la /usr/share/nginx/html/config.js
