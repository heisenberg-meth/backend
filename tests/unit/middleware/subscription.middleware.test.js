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

function createReqReplyTenant(tenantId) {
  const req = { tenantId };
  const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
  return { req, reply };
}

describe('subscriptionGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow active subscription', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    mockFindUnique.mockResolvedValue({ status: 'ACTIVE', endDate: futureDate });

    const { req, reply } = createReqReplyTenant('tenant-1');
    await subscriptionGuard(req, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should block expired subscription (ACTIVE but date passed)', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    mockFindUnique.mockResolvedValue({ status: 'ACTIVE', endDate: pastDate });

    const { req, reply } = createReqReplyTenant('tenant-1');
    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('expired') }) })
    );
  });

  it('should block EXPIRED status subscription', async () => {
    mockFindUnique.mockResolvedValue({ status: 'EXPIRED' });

    const { req, reply } = createReqReplyTenant('tenant-1');
    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('expired') }) })
    );
  });

  it('should block CANCELLED status subscription', async () => {
    mockFindUnique.mockResolvedValue({ status: 'CANCELLED' });

    const { req, reply } = createReqReplyTenant('tenant-1');
    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('should block SUSPENDED status subscription', async () => {
    mockFindUnique.mockResolvedValue({ status: 'SUSPENDED' });

    const { req, reply } = createReqReplyTenant('tenant-1');
    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('should allow grace period access', async () => {
    const futureGraceDate = new Date();
    futureGraceDate.setDate(futureGraceDate.getDate() + 5);
    mockFindUnique.mockResolvedValue({ status: 'GRACE_PERIOD', graceEndDate: futureGraceDate });

    const { req, reply } = createReqReplyTenant('tenant-1');
    await subscriptionGuard(req, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should block grace period if grace date passed', async () => {
    const pastGraceDate = new Date();
    pastGraceDate.setDate(pastGraceDate.getDate() - 5);
    mockFindUnique.mockResolvedValue({ status: 'GRACE_PERIOD', graceEndDate: pastGraceDate });

    const { req, reply } = createReqReplyTenant('tenant-1');
    await subscriptionGuard(req, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
  });

  it('should pass through when no subscription found', async () => {
    mockFindUnique.mockResolvedValue(null);

    const { req, reply } = createReqReplyTenant('tenant-1');
    await subscriptionGuard(req, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('should pass through when no tenant context', async () => {
    const req = {};
    const reply = { code: jest.fn().mockReturnThis(), send: jest.fn() };
    await subscriptionGuard(req, reply);
    expect(reply.code).not.toHaveBeenCalled();
  });
});
