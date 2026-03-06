// Runtime configuration for the frontend.
// In production, window.__ENV__ is populated by config.js (generated at container startup).
// In local development, it falls back to localhost defaults.

interface EnvConfig {
    API_BASE_URL?: string;
}

declare global {
    interface Window {
        __ENV__?: EnvConfig;
    }
}

export const API_BASE_URL =
    window.__ENV__?.API_BASE_URL || 'http://localhost:8000';

// Derive WebSocket URL from the HTTP URL (http→ws, https→wss)
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, 'ws');
