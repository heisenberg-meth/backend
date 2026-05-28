import request from 'supertest';
import { describe, it, expect, afterAll, beforeAll } from '@jest/globals';
import { FastifyInstance } from 'fastify';
import createServiceApp from '../../src/shared/app-factory.js';

let app: FastifyInstance;

describe('Health Endpoint (Integration)', () => {
  beforeAll(async () => {
    app = await createServiceApp({ name: 'TestService' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 OK and connected statuses when healthy', async () => {
    // Note: This expects the DB and Redis containers to be running (which they are in CI/docker-compose)
    const response = await request(app.server).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'online');
    expect(response.body).toHaveProperty('db', 'connected');
    expect(response.body).toHaveProperty('redis', 'connected');
    expect(response.body).toHaveProperty('service', 'TestService');
  });
});
