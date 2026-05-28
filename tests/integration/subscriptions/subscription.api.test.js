import { jest , describe, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';

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

jest.unstable_mockModule('../../../src/middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    req.tenantId = 'tenant-1';
    next();
  },
}));

const { default: subscriptionRoutes } = await import(
  '../../../src/modules/subscriptions/subscription.routes.js'
);

const app = express();
app.use(express.json());
app.use('/api/subscriptions', subscriptionRoutes);

describe('Subscription API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/subscriptions should create valid subscription', async () => {
    mockCreateSubscription.mockResolvedValue({ id: 'sub-1', status: 'ACTIVE' });
    const res = await request(app).post('/api/subscriptions').send({ planId: 'plan-1', billingCycle: 'monthly' });
    expect(res.statusCode).toBe(201);
  });

  it('POST /api/subscriptions should return 400 for invalid plan', async () => {
    mockCreateSubscription.mockRejectedValue(new Error('Invalid plan'));
    const res = await request(app).post('/api/subscriptions').send({ planId: 'invalid-plan', billingCycle: 'monthly' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/subscriptions/status should return status', async () => {
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'ACTIVE', plan: 'Premium' });
    const res = await request(app).get('/api/subscriptions/status');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('POST /api/subscriptions/cancel should cancel subscription', async () => {
    mockCancelSubscription.mockResolvedValue({ status: 'CANCELLED' });
    const res = await request(app).post('/api/subscriptions/cancel');
    expect(res.statusCode).toBe(200);
  });
});
