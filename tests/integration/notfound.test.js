import { jest, describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prismaConfigPath = path.resolve(__dirname, '../../src/config/prisma.js');
const redisConfigPath = path.resolve(__dirname, '../../src/config/redis.js');
const uptimeMonitorPath = path.resolve(__dirname, '../../src/shared/services/uptime-monitor.js');
const fastifyAppPath = path.resolve(__dirname, '../../src/fastify-app.js');

jest.unstable_mockModule('@fastify/redis', () => ({
  default: async (fastify) => {
    fastify.decorate('redis', {
      ping: async () => 'PONG',
      get: async () => null,
      set: async () => 'OK',
      del: async () => 1,
      quit: async () => 'OK',
    });
  },
}));

jest.unstable_mockModule(redisConfigPath, () => ({
  default: {
    ping: async () => 'PONG',
    quit: async () => {},
  },
  connectRedis: async () => {},
  quitRedis: async () => {},
  initRedis: () => ({
    ping: async () => 'PONG',
    quit: async () => {},
  }),
  getBullRedis: () => ({
    ping: async () => 'PONG',
    quit: async () => {},
  }),
  getRedisClient: () => ({
    ping: async () => 'PONG',
    quit: async () => {},
  }),
}));

jest.unstable_mockModule(prismaConfigPath, () => ({
  default: {
    $queryRaw: async () => [{ 1: 1 }],
    $connect: async () => {},
    $disconnect: async () => {},
  },
  ensureDbConnection: async () => {},
}));

jest.unstable_mockModule(uptimeMonitorPath, () => ({
  default: {
    start: () => {},
    stop: () => {},
    getHealthStatus: async () => [{ status: 'healthy' }],
    checkAll: async () => [{ status: 'healthy' }],
  },
}));

const { default: setupFastify } = await import(fastifyAppPath);
const { default: prisma } = await import(prismaConfigPath);

describe('NotFound Handler Recursion Fix', () => {
  let app;

  beforeAll(async () => {
    app = await setupFastify();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('should return JSON for invalid API routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/invalid-route-that-does-not-exist',
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.payload);
    expect(body).toEqual({
      success: false,
      error: 'Route not found',
      code: 'NOT_FOUND',
    });
  });

  it('should gracefully handle frontend fallback and not throw recursive errors for non-API routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/invalid-frontend-route',
    });

    if (response.statusCode === 200) {
      expect(response.payload).toContain('html');
    } else {
      expect(response.statusCode).toBe(404);
      expect(response.payload).toContain('index.html');
    }
  });
});
