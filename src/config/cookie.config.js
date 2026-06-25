import env from './env.js';

// ─── Cookie Domain Resolution ───────────────────────────────────────────────
const resolveCookieDomain = () => {
  if (env.nodeEnv === 'development') {
    return undefined;
  }
  if (env.cookieDomain) {
    return env.cookieDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
  return undefined;
};

const cookieDomain = resolveCookieDomain();

// ─── Base Options ───────────────────────────────────────────────────────────
const getBaseCookieOptions = () => {
  if (env.nodeEnv === 'development') {
    return {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      // Domain is explicitly undefined to avoid cross-subdomain local leakage
    };
  }

  // Staging & Production
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
};

const baseCookieOptions = getBaseCookieOptions();

// ─── Refresh Token Cookie ───────────────────────────────────────────────────
export const REFRESH_COOKIE_OPTIONS = {
  ...baseCookieOptions,
  maxAge: 30 * 24 * 60 * 60, // 30 days
};

// ─── Access Token Cookie ────────────────────────────────────────────────────
export const ACCESS_COOKIE_OPTIONS = {
  ...baseCookieOptions,
  maxAge: 15 * 60, // 15 minutes
};

// ─── Admin Refresh Token Cookie ─────────────────────────────────────────────
export const ADMIN_REFRESH_COOKIE_OPTIONS = {
  ...baseCookieOptions,
  partitioned: true,
  maxAge: 30 * 24 * 60 * 60,
};

// ─── Admin Access Token Cookie ──────────────────────────────────────────────
export const ADMIN_ACCESS_COOKIE_OPTIONS = {
  ...baseCookieOptions,
  partitioned: true,
  maxAge: 15 * 60,
};

// ─── Clear Cookie Options ───────────────────────────────────────────────────
export const CLEAR_COOKIE_OPTIONS = { ...baseCookieOptions };
export const COOKIE_PARSE_OPTIONS = { ...baseCookieOptions };

// ─── Cookie Names ───────────────────────────────────────────────────────────
export const COOKIE_NAMES = {
  REFRESH_TOKEN: 'refresh_token',
  ACCESS_TOKEN: 'accessToken',
  ADMIN_REFRESH_TOKEN: 'adminRefreshToken',
  ADMIN_ACCESS_TOKEN: 'adminAccessToken',
};

export const resolvedCookieDomain = cookieDomain;

export default {
  REFRESH_COOKIE_OPTIONS,
  ACCESS_COOKIE_OPTIONS,
  ADMIN_REFRESH_COOKIE_OPTIONS,
  ADMIN_ACCESS_COOKIE_OPTIONS,
  CLEAR_COOKIE_OPTIONS,
  COOKIE_PARSE_OPTIONS,
  COOKIE_NAMES,
  resolvedCookieDomain,
};
