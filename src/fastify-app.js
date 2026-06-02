import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fs from 'fs/promises';
import fastifyStatic from '@fastify/static';
import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import metrics from 'fastify-metrics';
import redis from '@fastify/redis';
import fastifyJwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import client from 'prom-client';
import path from 'path';
import { fileURLToPath } from 'url';
import { Prisma } from '@prisma/client';
import prisma from './config/prisma.js';
import { connectRedis } from './config/redis.js';
import env from './config/env.js';
import authRoutes from './modules/auth/routes/auth.fastify.routes.js';
import usersRoutes from './modules/users/users.fastify.routes.js';
import twoFactorRoutes from './modules/users/2fa.fastify.routes.js';
import uploadsRoutes from './modules/uploads/uploads.fastify.routes.js';
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
import stockRoutes from './modules/stock/routes/stock.fastify.routes.js';
import auditRoutes from './modules/audit/audit.fastify.routes.js';
import communicationsRoutes from './modules/communications/routes/communications.fastify.routes.js';
import loyaltyRoutes from './modules/loyalty/routes/loyalty.fastify.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbHealthGauge = new client.Gauge({
  name: 'health_db_status',
  help: 'Status of database connection (1 for connected, 0 for disconnected)',
});

const redisHealthGauge = new client.Gauge({
  name: 'health_redis_status',
  help: 'Status of redis connection (1 for connected, 0 for disconnected)',
});

const fastify = Fastify({
  bodyLimit: 50 * 1024 * 1024,
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
});

const setupFastify = async () => {
  await connectRedis();

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        scriptSrc: ["'self'", "https: 'unsafe-inline'"],
      },
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
      'X-Idempotency-Key',
      'x-session-id',
      'ngrok-skip-browser-warning',
    ],
    exposedHeaders: ['set-cookie'],
  });

  await fastify.register(csrf, {
    cookieOpts: { signed: true },
  });

  await fastify.register(redis, {
    url: env.redis.url,
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

  const avatarsRoot =
    process.env.NODE_ENV === 'production'
      ? '/tmp/uploads/avatars'
      : path.join(__dirname, '../uploads/avatars');
  await fs.mkdir(avatarsRoot, { recursive: true });
  const files = await fs.readdir(avatarsRoot);
  console.log('BOOT AVATAR FILES:', files);

  await fastify.register(fastifyStatic, {
    root: avatarsRoot,
    prefix: '/avatars/',
    decorateReply: false,
    setHeaders: (res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'GET');
    },
  });

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

  fastify.addHook('preHandler', subscriptionGuard);

  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(usersRoutes, { prefix: '/api/users' });
  await fastify.register(twoFactorRoutes, { prefix: '/api/users' });
  await fastify.register(uploadsRoutes, { prefix: '/api/uploads' });
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
  await fastify.register(importRoutes, {
    prefix: '/api/import',
    bodyLimit: 50 * 1024 * 1024,
  });
  await fastify.register(auditRoutes, { prefix: '/api/audit' });
  await fastify.register(communicationsRoutes, { prefix: '/api/communications' });
  await fastify.register(loyaltyRoutes, { prefix: '/api/loyalty' });

  return fastify;
};

export default setupFastify;
