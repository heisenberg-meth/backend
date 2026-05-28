import Fastify from 'fastify';
import authRoutes from '../../src/modules/auth/routes/auth.fastify.routes.js';
import { authenticate } from '../../src/middleware/auth.fastify.js';
import { describe, beforeAll, afterAll, it, expect } from '@jest/globals';

describe('Auth Integration Tests', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    
    app.decorate('authenticate', authenticate);
    
    // Mock fastify plugins if needed or register a dummy setup
    app.register(async (instance) => {
      await authRoutes(instance, {});
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  // Basic mock test for now since full integration requires Redis and DB mocks
  it('should validate missing fields on login', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email: 'test@example.com'
        // missing password
      }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body).toBeDefined();
  });

  it('should validate missing fields on register', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: {
        email: 'test@example.com'
        // missing password, fullName
      }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body).toBeDefined();
  });
});
