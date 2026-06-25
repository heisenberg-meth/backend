import fp from 'fastify-plugin';
import logger from '../shared/utils/logger.js';
import env from '../config/env.js';
import authMetricsService from '../modules/auth/service/auth.metrics.service.js';
import { resolvedCookieDomain } from '../config/cookie.config.js';

async function cookieValidationPlugin(fastify) {
  fastify.addHook('onRequest', async (request, reply) => {
    const originalSetCookie = reply.setCookie;
    if (!originalSetCookie) return;

    reply.setCookie = function (name, value, options = {}) {
      authMetricsService.recordCookieIssued();

      // Validate Domain in production
      if (env.nodeEnv === 'production') {
        if (!options.domain || options.domain.includes('localhost')) {
          authMetricsService.recordCookieRejected();
          const errMessage = `CookieValidationEngine: Issuing cookie "${name}" with invalid domain "${options.domain}" in production! Aborting response.`;
          logger.error({ url: request.url, cookie: name, domain: options.domain }, errMessage);
          throw new Error(errMessage);
        }

        if (!options.secure) {
          authMetricsService.recordCookieInvalid();
          const errMessage = `CookieValidationEngine: Issuing cookie "${name}" without Secure flag in production! Aborting response.`;
          logger.error({ url: request.url, cookie: name }, errMessage);
          throw new Error(errMessage);
        }

        // Track domain transitions for migration monitoring
        if (options.domain && options.domain !== resolvedCookieDomain) {
          authMetricsService.recordCookieMigration();
          logger.info(
            {
              event: 'COOKIE_DOMAIN_TRANSITION',
              cookie: name,
              fromDomain: options.domain,
              toDomain: resolvedCookieDomain,
              url: request.url,
            },
            `Cookie domain transition detected: "${options.domain}" -> "${resolvedCookieDomain}"`,
          );
        }
      }

      // Validate Path
      if (options.path && options.path !== '/') {
        logger.warn({ name, path: options.path }, 'Cookie issued with non-root path');
      }

      // Validate SameSite
      if (!options.sameSite) {
        logger.warn({ name }, 'Cookie issued without SameSite attribute');
      }

      return originalSetCookie.call(this, name, value, options);
    };
  });
}

export default fp(cookieValidationPlugin, { name: 'cookie-validation' });
