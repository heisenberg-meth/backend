import { jest , describe, beforeEach, it, expect } from '@jest/globals';

const mockFindUnique = jest.fn();

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({
  default: {
    subscription: { findUnique: mockFindUnique, update: jest.fn() },
  },
}));

const { subscriptionGuard } = await import(
  '../../../src/middleware/subscription.guard.fastify.js'
);

describe('Subscription Guard Middleware', () => {
  let req;
  let reply;

  beforeEach(() => {
    req = { tenantId: 'tenant-1' };
    reply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
    jest.clearAllMocks();
  });

  it('should allow active subscription', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    mockFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      endDate: futureDate,
    });

    await subscriptionGuard(req, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should block expired subscription (status ACTIVE but date passed)', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    mockFindUnique.mockResolvedValue({
      status: 'ACTIVE',
      endDate: pastDate,
    });

    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('expired') }) })
    );
  });

  it('should block expired subscription (status EXPIRED)', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'EXPIRED',
    });

    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('should allow grace period access', async () => {
    const futureGraceDate = new Date();
    futureGraceDate.setDate(futureGraceDate.getDate() + 5);
    mockFindUnique.mockResolvedValue({
      status: 'GRACE_PERIOD',
      graceEndDate: futureGraceDate,
    });

    await subscriptionGuard(req, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should block grace period if grace date passed', async () => {
    const pastGraceDate = new Date();
    pastGraceDate.setDate(pastGraceDate.getDate() - 5);
    mockFindUnique.mockResolvedValue({
      status: 'GRACE_PERIOD',
      graceEndDate: pastGraceDate,
    });

    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('should block suspended or cancelled subscription', async () => {
    mockFindUnique.mockResolvedValue({
      status: 'SUSPENDED',
    });

    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });
});
