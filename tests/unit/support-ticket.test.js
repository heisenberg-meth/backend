import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockPrisma = {
  supportTicket: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  supportMessage: { create: jest.fn() },
  supportAttachment: { create: jest.fn() },
  supportAuditLog: { create: jest.fn() },
  notification: { create: jest.fn() },
  user: { findMany: jest.fn(), findUnique: jest.fn() },
};

jest.unstable_mockModule('../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../src/shared/utils/logger.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: supportService } = await import(
  '../../src/modules/support/services/support.service.js'
);

describe('SupportService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTicket', () => {
    it('should create a ticket with auto-generated number', async () => {
      mockPrisma.supportTicket.count.mockResolvedValue(0);
      mockPrisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-1',
        ticketNumber: 'TKT-20260623-0001',
        title: 'Test Issue',
        status: 'OPEN',
      });
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);

      const result = await supportService.createTicket(tenantId, userId, {
        title: 'Test Issue',
        description: 'Test description',
        category: 'BILLING',
        priority: 'HIGH',
      });

      expect(result.ticketNumber).toMatch(/^TKT-\d{8}-\d{4}$/);
      expect(result.status).toBe('OPEN');
      expect(mockPrisma.supportAuditLog.create).toHaveBeenCalled();
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('should increment ticket number correctly', async () => {
      mockPrisma.supportTicket.count.mockResolvedValue(5);
      mockPrisma.supportTicket.create.mockResolvedValue({
        id: 'ticket-6',
        ticketNumber: 'TKT-20260623-0006',
      });
      mockPrisma.user.findMany.mockResolvedValue([]);

      await supportService.createTicket(tenantId, userId, {
        title: 'Test',
        description: 'Test',
        category: 'OTHER',
      });

      const createCall = mockPrisma.supportTicket.create.mock.calls[0][0];
      expect(createCall.data.ticketNumber).toBe('TKT-20260623-0006');
    });
  });

  describe('addReply', () => {
    it('should transition status when staff replies on WAITING_FOR_STAFF', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue({
        id: 'ticket-1',
        status: 'WAITING_FOR_STAFF',
        ticketNumber: 'TKT-001',
        createdById: 'staff-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'STAFF' });
      mockPrisma.supportMessage.create.mockResolvedValue({ id: 'msg-1' });

      await supportService.addReply(tenantId, 'ticket-1', userId, 'My reply');

      expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        })
      );
    });

    it('should transition status when admin replies on IN_PROGRESS', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue({
        id: 'ticket-1',
        status: 'IN_PROGRESS',
        ticketNumber: 'TKT-001',
        createdById: 'staff-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      mockPrisma.supportMessage.create.mockResolvedValue({ id: 'msg-1' });
      mockPrisma.user.findMany.mockResolvedValue([]);

      await supportService.addReply(tenantId, 'ticket-1', userId, 'Admin reply');

      expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'WAITING_FOR_STAFF' }),
        })
      );
    });

    it('should create audit log for reply', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue({
        id: 'ticket-1', status: 'OPEN', ticketNumber: 'TKT-001', createdById: 'staff-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'STAFF' });
      mockPrisma.supportMessage.create.mockResolvedValue({ id: 'msg-1' });

      await supportService.addReply(tenantId, 'ticket-1', userId, 'Reply');

      expect(mockPrisma.supportAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'REPLY_ADDED' }),
        })
      );
    });
  });

  describe('resolveTicket', () => {
    it('should set status to RESOLVED and notify creator', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue({
        id: 'ticket-1', status: 'IN_PROGRESS', ticketNumber: 'TKT-001', createdById: 'staff-1',
      });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 'ticket-1', status: 'RESOLVED' });

      await supportService.resolveTicket(tenantId, 'ticket-1', userId, 'Fixed the bug');

      expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'RESOLVED',
            resolutionSummary: 'Fixed the bug',
          }),
        })
      );
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });
  });

  describe('closeTicket', () => {
    it('should set status to CLOSED with closedAt', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue({
        id: 'ticket-1', status: 'RESOLVED', ticketNumber: 'TKT-001', createdById: 'staff-1',
      });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 'ticket-1', status: 'CLOSED' });

      await supportService.closeTicket(tenantId, 'ticket-1', userId);

      expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CLOSED',
            closedAt: expect.any(Date),
          }),
        })
      );
    });
  });

  describe('reopenTicket', () => {
    it('should reset status to OPEN and clear resolution', async () => {
      mockPrisma.supportTicket.findFirst.mockResolvedValue({
        id: 'ticket-1', status: 'RESOLVED', ticketNumber: 'TKT-001', createdById: 'staff-1',
      });
      mockPrisma.supportTicket.update.mockResolvedValue({ id: 'ticket-1', status: 'OPEN' });

      await supportService.reopenTicket(tenantId, 'ticket-1', userId, 'Issue persists');

      expect(mockPrisma.supportTicket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'OPEN',
            resolvedAt: null,
            resolutionSummary: null,
          }),
        })
      );
      expect(mockPrisma.supportMessage.create).toHaveBeenCalled();
    });
  });

  describe('getAdminDashboard', () => {
    it('should return ticket counts and avg resolution time', async () => {
      mockPrisma.supportTicket.count
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(3)   // open
        .mockResolvedValueOnce(2)   // inProgress
        .mockResolvedValueOnce(1)   // waitingForStaff
        .mockResolvedValueOnce(3)   // resolved
        .mockResolvedValueOnce(1)   // closed
        .mockResolvedValueOnce(0);  // critical

      mockPrisma.supportTicket.findMany.mockResolvedValue([
        { createdAt: new Date('2026-06-23T10:00:00Z'), resolvedAt: new Date('2026-06-23T12:00:00Z') },
        { createdAt: new Date('2026-06-23T08:00:00Z'), resolvedAt: new Date('2026-06-23T10:00:00Z') },
      ]);

      const result = await supportService.getAdminDashboard(tenantId);

      expect(result.totalTickets).toBe(10);
      expect(result.open).toBe(3);
      expect(result.avgResolutionHours).toBe(2);
    });
  });
});
