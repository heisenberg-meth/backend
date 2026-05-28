import { jest , describe, beforeEach, it, expect } from '@jest/globals';

const mockFindUnique = jest.fn();

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({
  default: {
    subscription: { findUnique: mockFindUnique },
  },
}));

const { subscriptionGuard } = await import(
  '../../../src/middleware/subscription.guard.fastify.js'
);

function createReqResTenant(tenantId) {
  const req = { tenantId };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('subscriptionGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow active subscription', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    mockFindUnique.mockResolvedValue({ status: 'ACTIVE', endDate: futureDate });

    const { req, res, next } = createReqResTenant('tenant-1');
    await subscriptionGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should block expired subscription (ACTIVE but date passed)', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    mockFindUnique.mockResolvedValue({ status: 'ACTIVE', endDate: pastDate });

    const { req, res, next } = createReqResTenant('tenant-1');
    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Subscription expired.' });
  });

  it('should block EXPIRED status subscription', async () => {
    mockFindUnique.mockResolvedValue({ status: 'EXPIRED' });

    const { req, res, next } = createReqResTenant('tenant-1');
    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Access denied due to subscription status.' });
  });

  it('should block CANCELLED status subscription', async () => {
    mockFindUnique.mockResolvedValue({ status: 'CANCELLED' });

    const { req, res, next } = createReqResTenant('tenant-1');
    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should block SUSPENDED status subscription', async () => {
    mockFindUnique.mockResolvedValue({ status: 'SUSPENDED' });

    const { req, res, next } = createReqResTenant('tenant-1');
    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow grace period access', async () => {
    const futureGraceDate = new Date();
    futureGraceDate.setDate(futureGraceDate.getDate() + 5);
    mockFindUnique.mockResolvedValue({ status: 'GRACE_PERIOD', graceEndDate: futureGraceDate });

    const { req, res, next } = createReqResTenant('tenant-1');
    await subscriptionGuard(req, res, next);
    expect(req.subscriptionGrace).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should block grace period if grace date passed', async () => {
    const pastGraceDate = new Date();
    pastGraceDate.setDate(pastGraceDate.getDate() - 5);
    mockFindUnique.mockResolvedValue({ status: 'GRACE_PERIOD', graceEndDate: pastGraceDate });

    const { req, res, next } = createReqResTenant('tenant-1');
    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 when no subscription found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { req, res, next } = createReqResTenant('tenant-1');
    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Active subscription required.' });
  });

  it('should return 403 when no tenant context', async () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Tenant context required.' });
  });
});
