import { jest , describe, beforeEach, beforeAll, afterAll, it, expect } from '@jest/globals';
import Fastify from 'fastify';

const mockCreateSubscription = jest.fn();
const mockGetSubscriptionStatus = jest.fn();
const mockCancelSubscription = jest.fn();

jest.unstable_mockModule('../../../src/modules/subscriptions/subscription.service.js', () => ({
  default: {
    createSubscription: mockCreateSubscription,
    getSubscriptionStatus: mockGetSubscriptionStatus,
    cancelSubscription: mockCancelSubscription,
  },
}));

jest.unstable_mockModule('../../../src/middleware/auth.fastify.js', () => ({
  authenticate: async (request) => {
    request.user = { id: 'user-1', tenantId: 'tenant-1' };
    request.tenantId = 'tenant-1';
  },
  requireTenant: async () => {},
}));

jest.unstable_mockModule('../../../src/middleware/subscription.guard.fastify.js', () => ({
  subscriptionGuard: async () => {},
}));

const { default: subscriptionRoutes } = await import(
  '../../../src/modules/subscriptions/subscription.fastify.routes.js'
);

describe('Subscription API Integration', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/api/subscriptions' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/subscriptions should create valid subscription', async () => {
    mockCreateSubscription.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });
    const res = await app.inject({ method: 'POST', url: '/api/subscriptions', payload: { planId: 'plan-1', billingCycle: 'monthly' } });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/subscriptions should return 400 for invalid plan', async () => {
    mockCreateSubscription.mockRejectedValue(new Error('Invalid plan'));
    const res = await app.inject({ method: 'POST', url: '/api/subscriptions', payload: { planId: 'invalid-plan', billingCycle: 'monthly' } });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/subscriptions/status should return status', async () => {
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'ACTIVE', plan: 'Premium' });
    const res = await app.inject({ method: 'GET', url: '/api/subscriptions/status' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).status).toBe('ACTIVE');
  });

  it('POST /api/subscriptions/cancel should cancel subscription', async () => {
    mockCancelSubscription.mockResolvedValue({ status: 'CANCELLED' });
    const res = await app.inject({ method: 'POST', url: '/api/subscriptions/cancel' });
    expect(res.statusCode).toBe(200);
  });
});
