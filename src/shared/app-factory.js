import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import cookie from '@fastify/cookie';
import csrf from '@fastify/csrf-protection';
import metrics from 'fastify-metrics';
import redis from '@fastify/redis';
import client from 'prom-client';
import prisma from '../config/prisma.js';
import env from '../config/env.js';


const dbHealthGauge = new client.Gauge({
  name: 'health_db_status',
  help: 'Status of database connection (1 for connected, 0 for disconnected)'
});

const redisHealthGauge = new client.Gauge({
  name: 'health_redis_status',
  help: 'Status of redis connection (1 for connected, 0 for disconnected)'
});

/**
 * Common application factory for all microservices
 */
const createServiceApp = async (options = {}) => {
  const { name, version = '1.0.0', description = 'Viyan Service' } = options;

  const fastify = Fastify({
    logger: {
      transport: process.env.NODE_ENV === 'development'
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

  // Register Shared Plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "no-referrer" },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    xContentTypeOptions: true,
    xDnsPrefetchControl: { allow: false },
    xFrameOptions: { action: "sameorigin" },
    xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
    xXssProtection: true,
  });
  
  await fastify.register(cookie, {
    secret: env.cookieSecret || 'super-secret-cookie-key',
  });

  await fastify.register(csrf, {
    cookieOpts: { 
      signed: true,
      httpOnly: true,
      secure: true,
      sameSite: 'none'
    },
  });

  await fastify.register(cors, {
    origin: env.cors?.origin || ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true,
    methods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token', 'X-Idempotency-Key', 'ngrok-skip-browser-warning'],
  });

  await fastify.register(redis, {
    url: env.redis.url,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    redis: fastify.redis,
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${context.after}`,
    }),
  });

  await fastify.register(swagger, {
    openapi: {
      info: { title: name, description, version },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/api-docs',
  });

  await fastify.register(metrics, {
    endpoint: '/metrics',
    routeMetrics: {
      enabled: true,
      registered: true,
      name: `http_request_duration_seconds_${name.toLowerCase().replace(/\s/g, '_')}`,
      buckets: [0.1, 0.5, 1, 2, 5],
    },
  });

  // Common Health Check
  fastify.get('/health', async (request, reply) => {
    const health = {
      service: name,
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

  return fastify;
};

export default createServiceApp;
