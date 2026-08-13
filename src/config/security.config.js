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
      scriptSrc: [
        "'self'",
        "'unsafe-eval'",
        "'wasm-unsafe-eval'",
        'https://checkout.razorpay.com',
        'https://*.razorpay.com',
      ],
      scriptSrcElem: ["'self'", 'https://checkout.razorpay.com', 'https://*.razorpay.com'],
      scriptSrcAttr: ["'none'"],
      styleSrc: [
        "'self'",
        'https:',
        'https://fonts.googleapis.com',
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
