import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import metrics from 'fastify-metrics';
import redis from '@fastify/redis';
import fastifyJwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fs from 'fs';
import client from 'prom-client';
import { Prisma } from '@prisma/client';
import prisma from './config/prisma.js';
import { connectRedis } from './config/redis.js';
import env from './config/env.js';
import authRoutes from './modules/auth/routes/auth.fastify.routes.js';
import usersRoutes from './modules/users/users.fastify.routes.js';
import twoFactorRoutes from './modules/users/2fa.fastify.routes.js';
import uploadsRoutes from './modules/uploads/uploads.fastify.routes.js';
import avatarRoutes from './modules/uploads/avatar.fastify.routes.js';
import purchaseOrderRoutes from './modules/purchase-orders/purchase-order.fastify.routes.js';
import subscriptionRoutes from './modules/subscriptions/subscription.fastify.routes.js';
import paymentRoutes from './modules/payments/payment.fastify.routes.js';
import analyticsRoutes from './modules/analytics/analytics.fastify.routes.js';
import settingsRoutes from './modules/settings/settings.fastify.routes.js';
import teamRoutes from './modules/team/team.fastify.routes.js';
import billingRoutes from './modules/billing/billing.fastify.routes.js';
import { subscriptionGuard } from './middleware/subscription.guard.fastify.js';
import billingAnalyticsRoutes from './modules/billing-analytics/routes/analytics.fastify.routes.js';
import billingActionsRoutes from './modules/billing-actions/routes/billing-actions.fastify.routes.js';
import inventoryRoutes from './modules/inventory/medicine.fastify.routes.js';
import medicineIntelligenceRoutes from './modules/medicines/routes/medicine.fastify.routes.js';
import batchFastifyRoutes from './modules/batches/routes/batch.fastify.routes.js';
import medicineMetadataRoutes from './modules/medicine-metadata/routes/metadata.fastify.routes.js';
import medicineAlertRoutes from './modules/medicine-alerts/routes/risk.fastify.routes.js';
import medicineConfigurationRoutes from './modules/medicine-configuration/routes/configuration.fastify.routes.js';
import medicineSearchFastifyRoutes from './modules/medicine-search/routes/medicine-search.fastify.routes.js';
import patientFeaturesRoutes from './modules/patient-features/routes/patient-features.fastify.routes.js';
import notificationSettingsRoutes from './modules/notification-settings/notification-settings.fastify.routes.js';
import alertSettingsRoutes from './modules/alert-settings/alert-settings.fastify.routes.js';
import integrationRoutes from './modules/integrations/routes/integration.fastify.routes.js';
import supplierRoutes from './modules/suppliers/routes/supplier.fastify.routes.js';
import purchaseRoutes from './modules/purchase/routes/purchase.fastify.routes.js';
import returnsRoutes from './modules/returns/routes/returns.fastify.routes.js';
import salesRoutes from './modules/sales/routes/sales.fastify.routes.js';
import accountingRoutes from './modules/finance/routes/accounting.fastify.routes.js';
import reportRoutes from './modules/reports/routes/report.fastify.routes.js';
import dashboardRoutes from './modules/dashboard/routes/dashboard.fastify.routes.js';
import alertRoutes from './modules/alerts/routes/alert.fastify.routes.js';
import intelligenceRoutes from './modules/expiry-intelligence/routes/intelligence.fastify.routes.js';
import branchesRoutes from './modules/branches/routes/branches.fastify.routes.js';
import refillRoutes from './modules/refill-reminders/routes/refill.fastify.routes.js';
import prescriptionRoutes from './modules/prescriptions/routes/prescription.fastify.routes.js';
import notificationRoutes from './modules/notifications/routes/notification.fastify.routes.js';
import patientRoutes from './modules/patients/routes/patient.fastify.routes.js';
import rbacRoutes from './modules/access-control/routes/rbac.fastify.routes.js';
import deliveryRoutes from './modules/delivery/routes/delivery.fastify.routes.js';
import ecommerceRoutes from './modules/ecommerce/routes/ecommerce.fastify.routes.js';
import importRoutes from './modules/import/routes/import.fastify.routes.js';
import disposalRoutes from './modules/disposal/disposal.fastify.routes.js';
import stockRoutes from './modules/stock/routes/stock.fastify.routes.js';
import auditRoutes from './modules/audit/audit.fastify.routes.js';
import communicationsRoutes from './modules/communications/routes/communications.fastify.routes.js';
import loyaltyRoutes from './modules/loyalty/routes/loyalty.fastify.routes.js';
import supplierReturnsRoutes from './modules/supplier-returns/routes/supplier-returns.routes.js';
import adminRoutes from './modules/admin/routes/admin.routes.js';
import logger from './shared/utils/logger.js';

const dbHealthGauge = new client.Gauge({
  name: 'health_db_status',
  help: 'Status of database connection (1 for connected, 0 for disconnected)',
});

const redisHealthGauge = new client.Gauge({
  name: 'health_redis_status',
  help: 'Status of redis connection (1 for connected, 0 for disconnected)',
});

const fastify = Fastify({
  bodyLimit: 1 * 1024 * 1024,
  logger: {
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
  trustProxy: true,
  ajv: {
    customOptions: {
      strict: false,
    },
  },
});

const setupFastify = async () => {
  await connectRedis();

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: [
          "'self'",
          'data:',
          'validator.swagger.io',
          'https://medassist-backend-hryu.onrender.com',
        ],
        scriptSrc: ["'self'"],
      },
    },
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  });

  await fastify.register(cookie, {
    secret: env.cookieSecret,
    parseOptions: {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      path: '/',
    },
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  await fastify.register(fastifyJwt, {
    secret: env.jwtSecrets[0],
    sign: {
      expiresIn: '15m',
      algorithm: 'HS256',
    },
    verify: {
      algorithms: ['HS256'],
    },
  });

  await fastify.register(cors, {
    origin: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'https://medassist-backend-hryu.onrender.com',
      'https://medassist.viyaninfo.com',
    ],
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
    exposedHeaders: ['set-cookie'],
  });

  await fastify.register(csrf, {
    cookieOpts: { signed: true },
  });

  fastify.get('/api/csrf-token', async (request, reply) => {
    const token = await reply.generateCsrf();
    return {
      success: true,
      csrfToken: token,
    };
  });

  fastify.addHook('preHandler', async (request, reply) => {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(request.method)) return;

    const exemptPaths = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/refresh',
      '/api/auth/forgot-password',
      '/api/auth/verify-reset-otp',
      '/api/auth/reset-password',
      '/api/auth/resend-reset-otp',
      '/api/payments/webhook',
      '/health',
      '/api/admin/login',
      '/api/admin/refresh',
    ];

    const isExempt = exemptPaths.some((p) => request.url.startsWith(p));
    if (isExempt) return;

    if (process.env.NODE_ENV === 'production') {
      await fastify.csrfProtection(request, reply);
    }
  });

  await fastify.register(redis, {
    url: env.redis.url,
  });

  // Global rate limit — 300 requests per minute per IP
  await fastify.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    redis: fastify.redis,
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

  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal Server Error';
    let code = error.code || 'INTERNAL_ERROR';

    if (error.validation) {
      statusCode = 400;
      message = error.message || 'Validation failed';
      code = 'VALIDATION_ERROR';
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      statusCode = 400;
      if (error.code === 'P2002') {
        statusCode = 409;
        message = 'A record with this value already exists.';
        code = 'UNIQUE_CONSTRAINT_VIOLATION';
      } else if (error.code === 'P2025') {
        statusCode = 404;
        message = 'Record not found.';
        code = 'RECORD_NOT_FOUND';
      } else {
        message = 'Database operation failed.';
        code = 'DATABASE_ERROR';
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      statusCode = 400;
      message = 'Invalid data provided.';
      code = 'VALIDATION_ERROR';
    }

    reply.code(statusCode).send({
      success: false,
      error: { message, code },
      stack: env.nodeEnv === 'production' ? undefined : error.stack,
    });
  });

  if (env.nodeEnv !== 'production') {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Viyan MedAssist API',
          description: 'Enterprise Scalable Backend',
          version: '1.0.0',
        },
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/api-docs',
      staticCSP: true,
    });
  }

  await fastify.register(metrics, {
    endpoint: '/metrics',
    routeMetrics: {
      enabled: true,
      registered: true,
      name: 'http_request_duration_seconds',
      buckets: [0.1, 0.5, 1, 2, 5],
    },
  });

  fastify.get('/health', async (request, reply) => {
    const health = {
      status: 'online',
      db: 'connected',
      redis: 'connected',
      timestamp: new Date(),
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbHealthGauge.set(1);
    } catch {
      health.status = 'degraded';
      health.db = 'disconnected';
      dbHealthGauge.set(0);
    }

    try {
      await fastify.redis.ping();
      redisHealthGauge.set(1);
    } catch {
      health.status = 'degraded';
      health.redis = 'disconnected';
      redisHealthGauge.set(0);
    }

    const statusCode = health.status === 'online' ? 200 : 500;
    return reply.code(statusCode).send(health);
  });

  fastify.get('/api/health', async (request, reply) => {
    let dbStatus = 'healthy';
    let redisStatus = 'healthy';

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      dbStatus = 'unhealthy';
      logger.info(error);
    }

    try {
      await fastify.redis.ping();
    } catch (error) {
      logger.info(error);
      redisStatus = 'unhealthy';
    }

    const statusCode = dbStatus === 'healthy' && redisStatus === 'healthy' ? 200 : 500;
    return reply.code(statusCode).send({
      database: dbStatus,
      redis: redisStatus,
      server: 'healthy',
    });
  });

  fastify.addHook('preHandler', subscriptionGuard);

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(twoFactorRoutes, { prefix: '/api/users' });
  await fastify.register(uploadsRoutes, { prefix: '/api/uploads' });
  await fastify.register(avatarRoutes, { prefix: '/avatars' });
  await fastify.register(purchaseOrderRoutes, { prefix: '/api/purchase-orders' });
  await fastify.register(subscriptionRoutes, { prefix: '/api/subscriptions' });
  await fastify.register(paymentRoutes, { prefix: '/api/payments' });
  await fastify.register(analyticsRoutes, { prefix: '/api/analytics' });
  await fastify.register(settingsRoutes, { prefix: '/api/settings' });
  await fastify.register(notificationSettingsRoutes, { prefix: '/api/settings' });
  await fastify.register(alertSettingsRoutes, { prefix: '/api/settings' });
  await fastify.register(integrationRoutes, { prefix: '/api/settings' });
  await fastify.register(teamRoutes, { prefix: '/api/team' });
  await fastify.register(billingRoutes, { prefix: '/api/billing' });
  await fastify.register(billingAnalyticsRoutes, { prefix: '/api/billing' });
  await fastify.register(billingActionsRoutes, { prefix: '/api/billing' });
  await fastify.register(inventoryRoutes, { prefix: '/api/inventory' });
  await fastify.register(medicineIntelligenceRoutes, { prefix: '/api/medicines' });
  await fastify.register(batchFastifyRoutes, { prefix: '/api/batches' });
  await fastify.register(medicineMetadataRoutes, { prefix: '/api/medicines' });
  await fastify.register(medicineAlertRoutes, { prefix: '/api/medicines' });
  await fastify.register(medicineConfigurationRoutes, { prefix: '/api/medicines' });
  await fastify.register(medicineSearchFastifyRoutes, { prefix: '/api/medicines' });
  await fastify.register(patientFeaturesRoutes, { prefix: '/api/patients' });
  await fastify.register(supplierRoutes, { prefix: '/api/suppliers' });
  await fastify.register(purchaseRoutes, { prefix: '/api/purchase' });
  await fastify.register(returnsRoutes, { prefix: '/api/billing' });
  await fastify.register(salesRoutes, { prefix: '/api/sales' });
  await fastify.register(accountingRoutes, { prefix: '/api/accounting' });
  await fastify.register(reportRoutes, { prefix: '/api/reports' });
  await fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });
  await fastify.register(alertRoutes, { prefix: '/api/alerts' });
  await fastify.register(intelligenceRoutes, { prefix: '/api/intelligence' });
  await fastify.register(branchesRoutes, { prefix: '/api/branches' });
  await fastify.register(refillRoutes, { prefix: '/api/refills' });
  await fastify.register(prescriptionRoutes, { prefix: '/api/prescriptions' });
  await fastify.register(notificationRoutes, { prefix: '/api/notifications' });
  await fastify.register(patientRoutes, { prefix: '/api/patients' });
  await fastify.register(rbacRoutes, { prefix: '/api/rbac' });
  await fastify.register(deliveryRoutes, { prefix: '/api/delivery' });
  await fastify.register(ecommerceRoutes, { prefix: '/api/ecommerce' });
  await fastify.register(stockRoutes, { prefix: '/api/stock' });
  await fastify.register(disposalRoutes, { prefix: '/api/inventory' });
  await fastify.register(importRoutes, {
    prefix: '/api/import',
    bodyLimit: 50 * 1024 * 1024,
  });
  await fastify.register(auditRoutes, { prefix: '/api/audit' });
  await fastify.register(communicationsRoutes, { prefix: '/api/communications' });
  await fastify.register(loyaltyRoutes, { prefix: '/api/loyalty' });
  await fastify.register(supplierReturnsRoutes, { prefix: '/api/supplier-returns' });
  await fastify.register(adminRoutes, { prefix: '/api/admin' });

  // ── Serve frontend static files (SPA) ──
  const frontendDist = new URL('../../frontend/dist', import.meta.url).pathname;
  const isFrontendBuilt = fs.existsSync(frontendDist);

  if (isFrontendBuilt) {
    await fastify.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      wildcard: false,
    });
  } else {
    // Add a basic root endpoint for health checks when frontend isn't served
    fastify.get('/', async () => ({
      status: 'ok',
      message: 'Viyan MedAssist API Backend is running',
    }));
  }

  // SPA fallback: all non-API, non-file routes → index.html
  fastify.setNotFoundHandler(async (request, reply) => {
    if (
      request.url.startsWith('/api/') ||
      request.url.startsWith('/avatars/') ||
      request.url.startsWith('/uploads/')
    ) {
      return reply.code(404).send({ success: false, error: 'Route not found', code: 'NOT_FOUND' });
    }

    if (isFrontendBuilt) {
      try {
        return await reply.sendFile('index.html');
      } catch (err) {
        return reply.code(404).send('Frontend not built. index.html not found.', err);
      }
    } else {
      return reply.code(404).send({
        success: false,
        error: 'Frontend not served on this instance',
        code: 'FRONTEND_MISSING',
      });
    }
  });

  return fastify;
};

export default setupFastify;
