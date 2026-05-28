import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';

describe('API Endpoints', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    app.get('/health', async (request, reply) => {
      return reply.code(200).send({ status: 'online' });
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 and online status', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).status).toBe('online');
    });
  });
});
