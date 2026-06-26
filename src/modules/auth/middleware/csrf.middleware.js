import crypto from 'crypto';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import logger from '../../../shared/utils/logger.js';
import cookieManager from '../../../shared/services/cookie-manager.service.js';
import { CSRF_EXEMPT_PATHS } from '../../../config/security.config.js';

const EXEMPT_ROUTES = new Set([
  ...CSRF_EXEMPT_PATHS,
  '/api/auth/recovery/request',
  '/api/webhooks/stripe',
]);

class CsrfMiddleware {
  generateToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  setCsrfCookie(reply, token) {
    cookieManager.setCsrfCookie(reply, token);
  }

  async verifyCsrf(request, reply) {
    const method = request.method?.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return;
    }

    const path = request.routerPath || request.raw?.url?.split('?')[0];
    if (EXEMPT_ROUTES.has(path)) {
      return;
    }

    const cookieToken = request.cookies?.csrf_token;
    const headerToken = request.headers['x-csrf-token'] || request.headers['x-xsrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      let reason = 'csrf_mismatch';
      if (!cookieToken) reason = 'csrf_cookie_missing';
      else if (!headerToken) reason = 'csrf_header_missing';

      logger.warn(
        {
          path,
          ip: request.ip,
          reason,
          hasCookie: !!cookieToken,
          hasHeader: !!headerToken,
        },
        'Blocked request: CSRF double-submit validation mismatch',
      );
      return reply.code(403).send({
        success: false,
        reason,
        message: 'CSRF validation failed.',
        code: AUTH_ERRORS.AUTH_INVALID_CSRF,
      });
    }
  }
}

export default new CsrfMiddleware();
