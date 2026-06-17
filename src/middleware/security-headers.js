/**
 * Security Headers Middleware
 * Adds security headers to responses
 */

export const securityHeaders = async (request, reply) => {
  // Content Security Policy
  reply.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.razorpay.com",
    "frame-src 'self' https://checkout.razorpay.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));

  // Strict Transport Security
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // X-Content-Type-Options
  reply.header('X-Content-Type-Options', 'nosniff');

  // X-Frame-Options
  reply.header('X-Frame-Options', 'DENY');

  // X-XSS-Protection
  reply.header('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Remove X-Powered-By
  reply.header('X-Powered-By', undefined);
};

export default securityHeaders;
