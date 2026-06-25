import {
  REFRESH_COOKIE_OPTIONS,
  ACCESS_COOKIE_OPTIONS,
  ADMIN_REFRESH_COOKIE_OPTIONS,
  ADMIN_ACCESS_COOKIE_OPTIONS,
  CLEAR_COOKIE_OPTIONS,
  COOKIE_PARSE_OPTIONS,
  COOKIE_NAMES,
  resolvedCookieDomain,
} from './cookie.config.js';

import { CORS_CONFIG } from './cors.config.js';
import { JWT_CONFIG } from './jwt.config.js';
import { AUTH_ERRORS } from './auth.errors.js';
import {
  HELMET_CONFIG,
  CSRF_CONFIG,
  CSRF_EXEMPT_PATHS,
  getRateLimitConfig,
} from './security.config.js';

// ─── Master Authentication & Security Configuration ──────────────────────────
// This file serves as the centralized point for all authentication, session,
// and security related settings across the entire application.

export const authConfig = {
  cookie: {
    refreshOptions: REFRESH_COOKIE_OPTIONS,
    accessOptions: ACCESS_COOKIE_OPTIONS,
    adminRefreshOptions: ADMIN_REFRESH_COOKIE_OPTIONS,
    adminAccessOptions: ADMIN_ACCESS_COOKIE_OPTIONS,
    clearOptions: CLEAR_COOKIE_OPTIONS,
    parseOptions: COOKIE_PARSE_OPTIONS,
    names: COOKIE_NAMES,
    domain: resolvedCookieDomain,
  },
  cors: CORS_CONFIG,
  jwt: JWT_CONFIG,
  errors: AUTH_ERRORS,
  security: {
    helmet: HELMET_CONFIG,
    csrf: CSRF_CONFIG,
    csrfExemptPaths: CSRF_EXEMPT_PATHS,
    getRateLimitConfig,
  },
};

export default authConfig;
