// ─── Security Configuration ──────────────────────────────────────────────────
// Centralized configuration for all Fastify security plugins.

// FIX #09: Removed 'unsafe-eval' entirely. Removed 'unsafe-inline' from scriptSrc/scriptSrcElem.
// Razorpay Checkout.js is loaded from their CDN and works without unsafe-eval.
// If a nonce-based CSP is needed for inline scripts, generate per-request nonces
// in a preHandler hook and inject them here.
export const HELMET_CONFIG = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:', 'validator.swagger.io', 'https://*.razorpay.com'],
      objectSrc: ["'none'"],
      // FIX #09: No unsafe-eval, no unsafe-inline — these nullify XSS protection entirely
      scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://*.razorpay.com'],
      scriptSrcElem: ["'self'", 'https://checkout.razorpay.com', 'https://*.razorpay.com'],
      scriptSrcAttr: ["'none'"],
      styleSrc: [
        "'self'",
        'https:',
        'https://fonts.googleapis.com',
        // unsafe-inline in styleSrc is acceptable (no code execution risk) but can be
        // replaced with nonces if a strict CSP is desired in future.
        "'unsafe-inline'",
        'https://*.razorpay.com',
      ],
      frameSrc: [
        "'self'",
        'https://api.razorpay.com',
        'https://checkout.razorpay.com',
        'https://*.razorpay.com',
      ],
      connectSrc: [
        "'self'",
        'https://api.razorpay.com',
        'https://checkout.razorpay.com',
        'https://*.razorpay.com',
        'wss://*.razorpay.com',
      ],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: {
    policy: 'cross-origin',
  },
};

export const CSRF_CONFIG = {
  cookieOpts: { signed: true },
};

// Paths exempt from CSRF checks
export const CSRF_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/verify-reset-otp',
  '/api/auth/reset-password',
  '/api/auth/resend-reset-otp',
  '/api/payments/webhook',
  '/api/payments/verify',
  '/health',
  '/api/admin/login',
  '/api/admin/refresh',
];

// FIX #11: Reduced global rate limit from 500/min to 100/min.
// Apply stricter per-route overrides on sensitive endpoints:
//   POST /api/auth/login    → 10/min  (in auth routes)
//   POST /api/auth/*/otp    → 5/min   (in auth routes)
//   POST /api/refunds/*     → 20/min  (in refund routes)
//   GET  /api/patients      → 30/min  (in patient routes)
export const getRateLimitConfig = (redisInstance) => ({
  max: 100,
  timeWindow: '1 minute',
  redis: redisInstance,
  keyGenerator: (request) => {
    const clientIp = request.ip;
    const userId = request.user?.id;
    return userId ? `rl:${userId}:${clientIp}` : `rl:ip:${clientIp}`;
  },
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Rate limit exceeded, retry in ${context.after}`,
    retryAfter: context.after,
  }),
});

export default {
  HELMET_CONFIG,
  CSRF_CONFIG,
  CSRF_EXEMPT_PATHS,
  getRateLimitConfig,
};
