import Fastify from 'fastify';
import crypto from 'crypto';
import os from 'os';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import cookie from '@fastify/cookie';
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
import { COOKIE_PARSE_OPTIONS } from './config/cookie.config.js';
import { CORS_CONFIG } from './config/cors.config.js';
import { JWT_CONFIG } from './config/jwt.config.js';
import { HELMET_CONFIG, getRateLimitConfig } from './config/security.config.js';
import { initSentry } from './config/sentry.js';
import uptimeMonitor from './shared/services/uptime-monitor.js';
import eventBus from './shared/services/eventbus.service.js';
import csrfMiddleware from './modules/auth/middleware/csrf.middleware.js';
import cookieManager from './shared/services/cookie-manager.service.js';
import authRoutes from './modules/auth/routes/auth.fastify.routes.js';
import usersRoutes from './modules/users/users.fastify.routes.js';
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
import crmRoutes from './modules/crm/crm.fastify.routes.js';
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
import supportRoutes from './modules/support/routes/support.routes.js';
import cookieValidationPlugin from './middleware/cookie-validation.fastify.js';
import authHealthRoutes from './modules/auth/routes/auth.health.routes.js';
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
  genReqId: () => {
    return 'REQ-' + crypto.randomUUID();
  },
  logger: {
    formatters: {
      log(object) {
        if (object.req) {
          object.tenantId = object.req.tenantId;
          object.userId = object.req.userId;
          object.requestId = object.req.requestId;
          object.endpoint = object.req.endpoint;
          delete object.req;
        }
        if (object.err) {
          object.error = object.err.message;
          object.stack = object.err.stack;
          delete object.err;
        }
        return object;
      },
    },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          requestId: request.id,
          tenantId: request.tenantId || 'unauthenticated',
          userId: request.user?.id || 'unauthenticated',
          endpoint: request.routerPath,
          clientIp: request.ip,
        };
      },
      res(reply) {
        return {
          statusCode: reply.statusCode,
          responseTime: reply.getResponseTime ? reply.getResponseTime() : undefined,
        };
      },
      err(error) {
        return {
          type: error.name,
          message: error.message,
          stack: error.stack,
          code: error.code,
        };
      },
    },
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

  initSentry(fastify);

  await fastify.register(helmet, HELMET_CONFIG);

  await fastify.register(cookie, {
    secret: env.cookieSecret,
    parseOptions: COOKIE_PARSE_OPTIONS,
  });

  await fastify.register(cookieValidationPlugin);

  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
  });

  await fastify.register(fastifyJwt, JWT_CONFIG.fastifyPluginOptions);

  await fastify.register(cors, CORS_CONFIG);

  fastify.get('/api/csrf-token', async (request, reply) => {
    let token = request.cookies?.csrf_token;
    if (!token) {
      token = csrfMiddleware.generateToken();
      cookieManager.setCsrfCookie(reply, token);
    }
    return {
      success: true,
      csrfToken: token,
    };
  });

  fastify.addHook('preHandler', csrfMiddleware.verifyCsrf.bind(csrfMiddleware));

  await fastify.register(redis, {
    url: env.redis.url,
    maxRetriesPerRequest: null,
  });

  await fastify.register(rateLimit, getRateLimitConfig(fastify.redis));

  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);

    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal Server Error';
    let code = error.code || 'INTERNAL_ERROR';
    let errors = undefined;

    if (error.name === 'ZodError' || error.issues) {
      statusCode = 400;
      message = 'Validation failed';
      code = 'VALIDATION_ERROR';
      errors = (error.issues || []).map((issue) => ({
        field: (issue.path || []).filter((p) => p !== 'body').join('.'),
        message: issue.message,
      }));
    } else if (error.validation) {
      statusCode = 400;
      message = error.message || 'Validation failed';
      code = 'VALIDATION_ERROR';
      errors = Array.isArray(error.validation)
        ? error.validation.map((v) => ({
            field:
              (v.instancePath || '').replace(/^\//, '') || v.params?.missingProperty || 'general',
            message: v.message || 'Invalid field',
          }))
        : [{ field: 'general', message: error.message }];
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      request.log.error({
        code: error.code,
        meta: error.meta,
        message: error.message,
        stack: error.stack,
        clientVersion: error.clientVersion,
      });

      statusCode = 400;
      if (error.code === 'P2002') {
        statusCode = 409;
        message = 'A record with this value already exists.';
        code = 'UNIQUE_CONSTRAINT_VIOLATION';
      } else if (error.code === 'P2025') {
        statusCode = 404;
        message = 'Record not found.';
        code = 'RECORD_NOT_FOUND';
      } else if (error.code === 'P2022') {
        statusCode = 503;
        message = 'Authentication service temporarily unavailable.';
        code = 'SCHEMA_MISMATCH';
      } else {
        message = 'Database operation failed.';
        code = 'DATABASE_ERROR';
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      statusCode = 400;
      message = 'Validation failed: Invalid database schema arguments provided.';
      code = 'VALIDATION_ERROR';
      errors = [
        {
          field: 'database_schema',
          message:
            'The request payload contains invalid or missing fields for the database operation.',
        },
      ];
    }

    reply.code(statusCode).send({
      success: false,
      message,
      error: { message, code, details: errors },
      errors,
      requestId: request.id,
      stack: env.nodeEnv === 'production' ? undefined : error.stack,
    });
  });

  const enableApiDocs = env.nodeEnv !== 'production' || process.env.ENABLE_API_DOCS === 'true';

  if (enableApiDocs) {
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

  const METRICS_ALLOWED_IPS = (process.env.METRICS_ALLOWED_IPS || '127.0.0.1,::1,::ffff:127.0.0.1')
    .split(',')
    .map((ip) => ip.trim());

  await fastify.register(metrics, {
    endpoint: '/metrics',
    routeMetrics: {
      enabled: true,
      registered: true,
      name: 'http_request_duration_seconds',
      buckets: [0.1, 0.5, 1, 2, 5],
    },
  });

  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url === '/metrics') {
      const original = routeOptions.preHandler || [];
      const originalHandlers = Array.isArray(original) ? original : [original];
      routeOptions.preHandler = [
        async (request, reply) => {
          const clientIp = request.ip;
          if (!METRICS_ALLOWED_IPS.includes(clientIp)) {
            fastify.log.warn(
              { clientIp },
              '[METRICS] Unauthorized access attempt to /metrics blocked',
            );
            reply.code(403).send({ error: 'Forbidden' });
          }
        },
        ...originalHandlers,
      ];
    }
  });

  fastify.get('/health', async (request, reply) => {
    let dbStatus = 'connected';
    let redisStatus = 'connected';
    let rabbitmqStatus = 'connected';
    let isHealthy = true;

    try {
      await prisma.$queryRaw`SELECT 1`;
      const authCols =
        await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND column_name IN ('failedLoginAttempts', 'lockedUntil', 'lastFailedLogin', 'lastSuccessfulLogin')`;
      if (authCols.length < 4) throw new Error('Schema mismatch');
      dbHealthGauge.set(1);
    } catch {
      dbStatus = 'disconnected';
      dbHealthGauge.set(0);
      isHealthy = false;
    }

    try {
      await fastify.redis.ping();
      redisHealthGauge.set(1);
    } catch {
      redisStatus = 'disconnected';
      redisHealthGauge.set(0);
      isHealthy = false;
    }

    if (env.rabbitmq?.enabled) {
      if (!eventBus.connection) {
        rabbitmqStatus = 'disconnected';
        isHealthy = false;
      }
    } else {
      rabbitmqStatus = 'disabled';
    }

    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const memUsage = (totalMem - freeMem) / totalMem;
    const memoryHealth = memUsage > 0.95 ? 'unhealthy' : 'healthy';
    if (memoryHealth === 'unhealthy') isHealthy = false;

    const loadAvg = os.loadavg()[0];
    const numCores = os.cpus().length || 1;
    const cpuHealth = loadAvg / numCores > 1.5 ? 'unhealthy' : 'healthy';
    if (cpuHealth === 'unhealthy') isHealthy = false;

    const clientIp = request.headers['x-forwarded-for']?.split(',')[0].trim() || request.ip;
    const HEALTH_ALLOWED_IPS = (
      process.env.HEALTH_ALLOWED_IPS || '127.0.0.1,::1,::ffff:127.0.0.1'
    ).split(',');
    const isInternal = HEALTH_ALLOWED_IPS.includes(clientIp);

    const health = {
      status: isHealthy ? 'healthy' : 'unhealthy',
    };

    if (isInternal) {
      health.database = dbStatus;
      health.redis = redisStatus;
      health.rabbitmq = rabbitmqStatus;
      health.memory = memoryHealth;
      health.cpu = cpuHealth;
      health.uptime = Math.floor(process.uptime());
    }

    const statusCode = isHealthy ? 200 : 503;
    return reply.code(statusCode).send(health);
  });

  fastify.get('/api/health', async (request, reply) => {
    let dbStatus = 'healthy';
    let redisStatus = 'healthy';

    try {
      await prisma.$queryRaw`SELECT 1`;
      const authCols =
        await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND column_name IN ('failedLoginAttempts', 'lockedUntil', 'lastFailedLogin', 'lastSuccessfulLogin')`;
      if (authCols.length < 4) throw new Error('Schema mismatch');
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

  fastify.get('/health/database', async (request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const authCols =
        await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND column_name IN ('failedLoginAttempts', 'lockedUntil', 'lastFailedLogin', 'lastSuccessfulLogin')`;
      if (authCols.length < 4) throw new Error('Schema mismatch');
      return { status: 'healthy' };
    } catch (e) {
      return reply.code(500).send({ status: 'unhealthy', error: e.message });
    }
  });

  fastify.get('/health/redis', async (request, reply) => {
    try {
      await fastify.redis.ping();
      return { status: 'healthy' };
    } catch (e) {
      return reply.code(500).send({ status: 'unhealthy', error: e.message });
    }
  });

  fastify.get('/health/storage', async () => {
    return { status: 'healthy' };
  });

  fastify.get('/api/health/uptime', async (request, reply) => {
    const status = await uptimeMonitor.getHealthStatus();
    const allHealthy = status.every((s) => s.status === 'healthy');
    return reply.code(allHealthy ? 200 : 503).send({
      status: allHealthy ? 'healthy' : 'degraded',
      services: status,
      timestamp: new Date(),
    });
  });

  fastify.post('/api/health/check', async () => {
    const status = await uptimeMonitor.checkAll();
    return { success: true, data: status };
  });

  fastify.addHook('preHandler', subscriptionGuard);

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(authHealthRoutes, { prefix: '/api/auth' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
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
  await fastify.register(crmRoutes, { prefix: '/api/crm' });
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
  await fastify.register(supportRoutes, { prefix: '/api/support' });

  const uploadsDir = new URL('../uploads', import.meta.url).pathname;
  const isUploadsDir = fs.existsSync(uploadsDir);

  if (isUploadsDir) {
    await fastify.register(fastifyStatic, {
      root: uploadsDir,
      prefix: '/uploads/',
      decorateReply: false,
    });
  }

  const frontendDist = new URL('../../frontend/dist', import.meta.url).pathname;
  const isFrontendBuilt = fs.existsSync(frontendDist);

  if (isFrontendBuilt) {
    await fastify.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      setHeaders: (res, path) => {
        if (typeof res?.setHeader === 'function') {
          if (path.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (path.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
          }
        } else if (typeof res?.header === 'function') {
          if (path.includes('/assets/')) {
            res.header('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (path.endsWith('index.html')) {
            res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.header('Pragma', 'no-cache');
            res.header('Expires', '0');
          }
        }
      },
    });
  } else {
    fastify.get('/', async () => ({
      status: 'ok',
      message: 'Viyan MedAssist API Backend is running',
    }));
  }

  fastify.setNotFoundHandler(async (request, reply) => {
    if (
      request.url.startsWith('/api/') ||
      request.url.startsWith('/avatars/') ||
      request.url.startsWith('/uploads/') ||
      request.url.startsWith('/assets/') ||
      request.url.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)
    ) {
      return reply
        .code(404)
        .send({ success: false, error: 'Route or asset not found', code: 'NOT_FOUND' });
    }

    if (isFrontendBuilt) {
      try {
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        reply.header('Pragma', 'no-cache');
        reply.header('Expires', '0');
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

  uptimeMonitor.start();

  return fastify;
};

export default setupFastify;
