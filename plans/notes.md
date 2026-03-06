## Troubleshooting: Front end env setting for the backend URL ##
Solution for making the backend API URL configurable:

1. __`frontend/src/config.ts`__ — Central config that reads `window.__ENV__` with localhost fallback
2. __`frontend/config.js.template`__ — Template with `${API_BASE_URL}` placeholder
3. __`frontend/entrypoint.sh`__ — Runs via `/docker-entrypoint.d/` to generate `config.js` at container startup
4. __`frontend/nginx.conf.template`__ — No-cache headers for `config.js`
5. __`frontend/vite.config.ts`__ — PWA service worker exclusions for `config.js` (this was the tricky one!)
6. __Updated App.tsx, LiveChat.tsx, StoryboardView.tsx__ — Use `API_BASE_URL`/`WS_BASE_URL` from config

The PWA service worker intercepting `/config.js` and serving the cached `index.html` was the sneaky root cause. For future reference — any runtime-generated files need to be excluded from the service worker's navigation fallback and caching strategies.
