import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const redisPath = path.resolve(__dirname, '../../../config/redis.js');
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const notificationQueuePath = path.resolve(__dirname, '../queue/notification.queue.js');
const queueServicePath = path.resolve(__dirname, '../queues/queue.service.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');

const notificationServicePath = path.resolve(__dirname, '../services/notification.service.js');
const dedupServicePath = path.resolve(__dirname, '../services/deduplication.service.js');
const rateLimitServicePath = path.resolve(__dirname, '../services/rate-limit.service.js');
const deliveryTrackingServicePath = path.resolve(
  __dirname,
  '../services/delivery-tracking.service.js',
);
const analyticsServicePath = path.resolve(__dirname, '../services/analytics.service.js');

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
};

const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
  notificationDeliveryEvent: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  notificationTemplate: {
    findFirst: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  notificationPreference: {
    findFirst: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  stockAlert: {
    findMany: jest.fn(),
  },
};

const mockNotificationQueue = {
  add: jest.fn(),
};

const mockEmitLocalEvent = jest.fn();

jest.unstable_mockModule(redisPath, () => ({
  getBullRedis: jest.fn().mockReturnValue({}),
  default: mockRedis,
}));

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(notificationQueuePath, () => ({
  notificationQueue: mockNotificationQueue,
}));

jest.unstable_mockModule(queueServicePath, () => ({
  default: {
    enqueue: mockNotificationQueue.add,
  },
}));

jest.unstable_mockModule(localEventBusPath, () => ({
  emitLocalEvent: mockEmitLocalEvent,
  localEventBus: { removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const [notificationServiceModule, dedupModule, rateLimitModule, deliveryTrackingModule, analyticsModule] = await Promise.all([
  import(notificationServicePath),
  import(dedupServicePath),
  import(rateLimitServicePath),
  import(deliveryTrackingServicePath),
  import(analyticsServicePath),
]);
const notificationService = notificationServiceModule.default;
const notificationDeduplicationService = dedupModule.default;
const notificationRateLimitService = rateLimitModule.default;
const deliveryTrackingService = deliveryTrackingModule.default;
const notificationAnalyticsService = analyticsModule.default;

describe('Notification Deduplication Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkDuplicate', () => {
    it('should return true when dedupe key exists', async () => {
      mockRedis.get.mockResolvedValue('1');

      const result = await notificationDeduplicationService.checkDuplicate(
        't1',
        'EMAIL',
        'user@test.com',
        'LOW_STOCK_ALERT',
        'ALERT',
      );

      expect(result).toBe(true);
    });

    it('should return false when dedupe key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await notificationDeduplicationService.checkDuplicate(
        't1',
        'EMAIL',
        'user@test.com',
        'LOW_STOCK_ALERT',
        'ALERT',
      );

      expect(result).toBe(false);
    });
  });

  describe('markSent', () => {
    it('should set dedupe key with TTL', async () => {
      await notificationDeduplicationService.markSent(
        't1',
        'SMS',
        '+919876543210',
        'CRITICAL_ALERT',
        'ALERT',
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'notification:dedupe:t1:SMS:+919876543210:CRITICAL_ALERT:ALERT',
        '1',
        'EX',
        1800,
      );
    });
  });

  describe('setCooldown', () => {
    it('should set cooldown key', async () => {
      await notificationDeduplicationService.setCooldown('notif-1', 3600);

      expect(mockRedis.set).toHaveBeenCalledWith('notification:cooldown:notif-1', '1', 'EX', 3600);
    });
  });
});

describe('Notification Rate Limit Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should allow notification within limit', async () => {
      mockRedis.incr.mockResolvedValue(3);

      const result = await notificationRateLimitService.checkRateLimit(
        't1',
        'sms',
        '+919876543210',
      );

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(3);
      expect(result.max).toBe(5);
    });

    it('should block notification exceeding SMS limit', async () => {
      mockRedis.incr.mockResolvedValue(6);

      const result = await notificationRateLimitService.checkRateLimit(
        't1',
        'sms',
        '+919876543210',
      );

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBe(60);
    });

    it('should set expiry on first increment', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await notificationRateLimitService.checkRateLimit('t1', 'email', 'user@test.com');

      expect(mockRedis.expire).toHaveBeenCalled();
    });
  });

  describe('resetRateLimit', () => {
    it('should delete rate limit key', async () => {
      await notificationRateLimitService.resetRateLimit('t1', 'sms', '+919876543210');

      expect(mockRedis.del).toHaveBeenCalledWith('notification:ratelimit:t1:sms:+919876543210');
    });
  });
});

describe('Delivery Tracking Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('recordEvent', () => {
    it('should create delivery event and update notification status', async () => {
      mockPrisma.notificationDeliveryEvent.create.mockResolvedValue({
        id: 'event-1',
        eventType: 'SENT',
      });
      mockPrisma.notification.update.mockResolvedValue({});

      await deliveryTrackingService.markSent('notif-1', 'sms-provider', 'msg-123');

      expect(mockPrisma.notificationDeliveryEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notificationId: 'notif-1',
            eventType: 'SENT',
            providerName: 'sms-provider',
            providerMessageId: 'msg-123',
          }),
        }),
      );
      expect(mockPrisma.notification.update).toHaveBeenCalled();
      expect(mockEmitLocalEvent).toHaveBeenCalledWith('NOTIFICATION_SENT', expect.any(Object));
    });

    it('should emit FAILED event on failure', async () => {
      mockPrisma.notificationDeliveryEvent.create.mockResolvedValue({
        id: 'event-1',
        eventType: 'FAILED',
      });
      mockPrisma.notification.update.mockResolvedValue({});

      await deliveryTrackingService.markFailed('notif-1', 'Provider timeout', 'sms-provider');

      expect(mockEmitLocalEvent).toHaveBeenCalledWith('NOTIFICATION_FAILED', expect.any(Object));
    });
  });

  describe('getDeliveryHistory', () => {
    it('should return all delivery events for notification', async () => {
      mockPrisma.notificationDeliveryEvent.findMany.mockResolvedValue([
        { eventType: 'QUEUED', eventTimestamp: new Date() },
        { eventType: 'PROCESSING', eventTimestamp: new Date() },
        { eventType: 'SENT', eventTimestamp: new Date() },
      ]);

      const events = await deliveryTrackingService.getDeliveryHistory('notif-1');

      expect(events).toHaveLength(3);
    });
  });
});

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotificationQueue.add.mockResolvedValue({ id: 'job-1' });
  });

  describe('queueNotification', () => {
    it('should queue notification and add to BullMQ', async () => {
      mockPrisma.notificationPreference.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-1',
        deliveryStatus: 'QUEUED',
      });

      const result = await notificationService.queueNotification({
        tenantId: 't1',
        userId: 'user-1',
        notificationType: 'ALERT',
        channel: 'EMAIL',
        recipient: 'user@test.com',
        subject: 'Test Alert',
        message: 'Test message',
      });

      expect(result.success).toBe(true);
      expect(result.notificationId).toBe('notif-1');
      expect(mockNotificationQueue.add).toHaveBeenCalled();
    });

    it('should skip notification if preference disabled', async () => {
      mockPrisma.notificationPreference.findFirst.mockResolvedValue({ enabled: false });

      const result = await notificationService.queueNotification({
        tenantId: 't1',
        userId: 'user-1',
        notificationType: 'ALERT',
        channel: 'SMS',
        recipient: '+919876543210',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('PREFERENCE_DISABLED');
    });

    it('should render template if templateName provided', async () => {
      mockPrisma.notificationPreference.findFirst.mockResolvedValue(null);
      mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
        templateBody: 'Hello {{name}}, your stock is low',
      });
      mockPrisma.notification.create.mockResolvedValue({
        id: 'notif-1',
        deliveryStatus: 'QUEUED',
      });

      const result = await notificationService.queueNotification({
        tenantId: 't1',
        notificationType: 'ALERT',
        channel: 'SMS',
        recipient: '+919876543210',
        templateName: 'LOW_STOCK_ALERT',
        variables: { name: 'Manager' },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('updateStatus', () => {
    it('should update notification delivery status', async () => {
      mockPrisma.notification.update.mockResolvedValue({});

      await notificationService.updateStatus('notif-1', 'DELIVERED');

      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif-1' },
          data: expect.objectContaining({
            deliveryStatus: 'DELIVERED',
            sentAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});

describe('Notification Analytics Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDeliveryStats', () => {
    it('should return comprehensive delivery statistics', async () => {
      mockPrisma.notification.count.mockResolvedValue(100);
      mockPrisma.notification.groupBy
        .mockResolvedValueOnce([
          { channel: 'EMAIL', _count: 50 },
          { channel: 'SMS', _count: 30 },
          { channel: 'WHATSAPP', _count: 20 },
        ])
        .mockResolvedValueOnce([
          { deliveryStatus: 'DELIVERED', _count: 70 },
          { deliveryStatus: 'SENT', _count: 10 },
          { deliveryStatus: 'FAILED', _count: 20 },
        ]);
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const result = await notificationAnalyticsService.getDeliveryStats('t1', { days: 30 });

      expect(result.total).toBe(100);
      expect(result.channelBreakdown.EMAIL).toBe(50);
      expect(result.successRate).toBe(80);
    });
  });

  describe('getProviderPerformance', () => {
    it('should aggregate provider performance metrics', async () => {
      mockPrisma.notificationDeliveryEvent.findMany.mockResolvedValue([
        { providerName: 'twilio', eventType: 'SENT', eventTimestamp: new Date() },
        { providerName: 'twilio', eventType: 'DELIVERED', eventTimestamp: new Date() },
        { providerName: 'twilio', eventType: 'FAILED', eventTimestamp: new Date() },
      ]);

      const result = await notificationAnalyticsService.getProviderPerformance('t1');

      expect(result).toHaveLength(1);
      expect(result[0].providerName).toBe('twilio');
      expect(result[0].total).toBe(3);
    });
  });

  describe('getResponseTimes', () => {
    it('should calculate average latency per channel', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 5000);

      mockPrisma.notification.findMany.mockResolvedValue([
        { channel: 'EMAIL', createdAt: earlier, sentAt: now },
        { channel: 'EMAIL', createdAt: earlier, sentAt: now },
      ]);

      const result = await notificationAnalyticsService.getResponseTimes('t1');

      expect(result).toHaveLength(1);
      expect(result[0].channel).toBe('EMAIL');
      expect(result[0].avgLatencyMs).toBe(5000);
    });
  });
});
