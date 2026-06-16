import setupFastify from '../../src/fastify-app.js';
import prisma from '../../src/config/prisma.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

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

    expect(response.statusCode).toBe(404);
    // Even if index.html is missing during tests, it should handle the catch block properly
    // and not crash with the Fastify internal error.
    expect(response.payload).toContain('index.html');
  });
});
