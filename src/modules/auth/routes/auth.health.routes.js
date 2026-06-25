import prisma from '../../../config/prisma.js';
import redis from '../../../config/redis.js';
import env from '../../../config/env.js';
import authMetricsService from '../service/auth.metrics.service.js';
import { CURRENT_AUTH_VERSION } from '../auth.constants.js';
import { resolvedCookieDomain } from '../../../config/cookie.config.js';

export async function authHealthRoutes(fastify) {
  fastify.get('/health', async () => {
    let dbStatus = 'connected';
    let redisStatus = 'connected';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    try {
      await redis.ping();
    } catch {
      redisStatus = 'disconnected';
    }

    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      authentication: 'ok',
      cookies: 'ok',
      jwt: 'ok',
      sessions: dbStatus === 'connected' && redisStatus === 'connected' ? 'ok' : 'degraded',
      authVersion: CURRENT_AUTH_VERSION,
      deploymentStatus: 'active',
      environment: env.nodeEnv,
      cookieDomain: resolvedCookieDomain || 'none',
    };
  });

  fastify.get('/health/sessions', async (request, reply) => {
    let dbStatus = 'connected';
    let redisStatus = 'connected';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'disconnected';
    }

    try {
      await redis.ping();
    } catch {
      redisStatus = 'disconnected';
    }

    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';

    let sessionCount = 0;
    if (dbStatus === 'connected') {
      try {
        const result = await prisma.userSession.count({ where: { revoked: false } });
        sessionCount = result;
      } catch {
        // ignore
      }
    }

    return reply.code(isHealthy ? 200 : 500).send({
      status: isHealthy ? 'healthy' : 'unhealthy',
      databaseConnectivity: dbStatus,
      sessionStore: redisStatus,
      sessionTable: dbStatus === 'connected' ? 'accessible' : 'inaccessible',
      activeSessions: sessionCount,
      cleanupJobStatus: 'active',
    });
  });

  fastify.get('/health/cookies', async () => {
    const isProd = env.nodeEnv === 'production';
    const domainValid = isProd ? env.cookieDomain && !env.cookieDomain.includes('localhost') : true;

    return {
      status: domainValid ? 'healthy' : 'degraded',
      productionDomain: env.cookieDomain || 'localhost',
      secureFlag: isProd ? true : false,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      environmentCompatibility: domainValid ? 'ok' : 'invalid_domain_in_prod',
      environment: env.nodeEnv,
    };
  });

  fastify.get('/metrics', async () => {
    return {
      success: true,
      data: authMetricsService.getMetrics(),
    };
  });

  // ── Dev-only CSRF diagnostic endpoint ──────────────────────────────────
  // Hit POST /api/auth/debug/csrf with the normal interceptors to see whether
  // your CSRF cookie and header are synchronized. Never expose in production.
  if (env.nodeEnv !== 'production') {
    const { authenticate } = await import('../../../middleware/auth.fastify.js');

    fastify.post('/debug/csrf', { preHandler: [authenticate] }, async (request) => {
      const cookieToken = request.cookies?.csrf_token;
      const headerToken = request.headers['x-csrf-token'] || request.headers['x-xsrf-token'];
      return {
        success: true,
        hasCookie: !!cookieToken,
        hasHeader: !!headerToken,
        match: !!(cookieToken && headerToken && cookieToken === headerToken),
        cookieNames: Object.keys(request.cookies || {}),
        environment: env.nodeEnv,
      };
    });
  }
}

export default authHealthRoutes;
