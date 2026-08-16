import env from './env.js';

// ─── CORS Configuration ────────────────────────────────────────────────────
// Single source of truth for all CORS settings.
// Uses CORS_ORIGIN env var when available, otherwise falls back to defaults.

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

const DEFAULT_PROD_ORIGINS = ['https://medassist.viyaninfo.com'];

const resolveOrigins = () => {
  if (env.cors.origin && Array.isArray(env.cors.origin) && env.cors.origin.length > 0) {
    return env.cors.origin;
  }
  if (env.nodeEnv === 'development') {
    return DEFAULT_DEV_ORIGINS;
  }
  return DEFAULT_PROD_ORIGINS;
};

export const CORS_CONFIG = {
  origin: resolveOrigins(),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-auth-token',
    'x-csrf-token',
    'X-Idempotency-Key',
    'x-session-id',
    'ngrok-skip-browser-warning',
  ],
  // FIX #07: 'set-cookie' removed — browsers handle Set-Cookie automatically when
  // withCredentials/credentials:true is set. Exposing it to JS weakens cookie security.
  exposedHeaders: ['x-request-id', 'x-ratelimit-limit', 'x-ratelimit-remaining'],
};
