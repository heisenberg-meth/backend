import { jest, describe, it, expect, afterAll, beforeAll } from '@jest/globals';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const prismaConfigPath = path.resolve(__dirname, '../../src/config/prisma.js');
const redisConfigPath = path.resolve(__dirname, '../../src/config/redis.js');
const uptimeMonitorPath = path.resolve(__dirname, '../../src/shared/services/uptime-monitor.js');
const appFactoryPath = path.resolve(__dirname, '../../src/shared/app-factory.js');
const fastifyRedisPath = require.resolve('@fastify/redis');

jest.unstable_mockModule(fastifyRedisPath, () => ({
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

const { default: createServiceApp } = await import(appFactoryPath);

let app;

describe('Health Endpoint (Integration)', () => {
  beforeAll(async () => {
    app = await createServiceApp({ name: 'TestService' });

    // Explicit fallback decoration to ensure app.redis is always mocked
    if (!app.redis) {
      app.decorate('redis', {
        ping: async () => 'PONG',
        get: async () => null,
        set: async () => 'OK',
        del: async () => 1,
        quit: async () => 'OK',
      });
    }

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 OK and connected statuses when healthy', async () => {
    const response = await request(app.server).get('/health');

    if (response.status !== 200) {
      console.log('Response status:', response.status);
      console.log('Response body:', response.body);
      console.log('Response text:', response.text);
    }

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'online');
    expect(response.body).toHaveProperty('db', 'connected');
    expect(response.body).toHaveProperty('redis', 'connected');
    expect(response.body).toHaveProperty('service', 'TestService');
  });
});
