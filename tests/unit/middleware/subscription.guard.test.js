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

describe('Subscription Guard Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { tenantId: 'tenant-1' };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('should allow active subscription', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    mockFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      endDate: futureDate,
    });

    await subscriptionGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should block expired subscription (status ACTIVE but date passed)', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    mockFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      endDate: pastDate,
    });

    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Subscription expired.' });
  });

  it('should block expired subscription (status EXPIRED)', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'EXPIRED',
    });

    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should allow grace period access', async () => {
    const futureGraceDate = new Date();
    futureGraceDate.setDate(futureGraceDate.getDate() + 5);
    mockFindUnique.mockResolvedValue({
      status: 'GRACE_PERIOD',
      graceEndDate: futureGraceDate,
    });

    await subscriptionGuard(req, res, next);
    expect(req.subscriptionGrace).toBe(true);
    expect(next).toHaveBeenCalled();
  });

  it('should block grace period if grace date passed', async () => {
    const pastGraceDate = new Date();
    pastGraceDate.setDate(pastGraceDate.getDate() - 5);
    mockFindUnique.mockResolvedValue({
      status: 'GRACE_PERIOD',
      graceEndDate: pastGraceDate,
    });

    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should block suspended or cancelled subscription', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'SUSPENDED',
    });

    await subscriptionGuard(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
