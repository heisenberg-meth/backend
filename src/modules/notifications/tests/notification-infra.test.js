import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const redisPath = path.resolve(__dirname, '../../../config/redis.js');
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const queueServicePath = path.resolve(__dirname, '../queues/queue.service.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');

const patientPreferenceServicePath = path.resolve(
  __dirname,
  '../services/patient-preference.service.js',
);
const channelFallbackServicePath = path.resolve(
  __dirname,
  '../services/channel-fallback.service.js',
);
const throttlingServicePath = path.resolve(__dirname, '../services/throttling.service.js');
const orchestratorServicePath = path.resolve(__dirname, '../services/orchestrator.service.js');
const deduplicationServicePath = path.resolve(__dirname, '../services/deduplication.service.js');
const rateLimitServicePath = path.resolve(__dirname, '../services/rate-limit.service.js');

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
};

const mockPrisma = {
  patient: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
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
  notificationSettings: {
    findFirst: jest.fn(),
  },
};

const mockQueueService = {
  enqueue: jest.fn().mockResolvedValue({ id: 'job-1' }),
  getMetrics: jest.fn().mockResolvedValue({}),
};
const mockEmitLocalEvent = jest.fn();

jest.unstable_mockModule(redisPath, () => ({
  getBullRedis: jest.fn().mockReturnValue({}),
  default: mockRedis,
}));
jest.unstable_mockModule(prismaPath, () => ({ default: mockPrisma }));
jest.unstable_mockModule(queueServicePath, () => ({
  default: mockQueueService,
}));
jest.unstable_mockModule(localEventBusPath, () => ({
  emitLocalEvent: mockEmitLocalEvent,
  localEventBus: { removeAllListeners: jest.fn() },
}));
jest.unstable_mockModule(loggerPath, () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const patientPreferenceService = (await import(patientPreferenceServicePath)).default;
const channelFallbackService = (await import(channelFallbackServicePath)).default;
const throttlingService = (await import(throttlingServicePath)).default;
const orchestratorService = (await import(orchestratorServicePath)).default;
const deduplicationService = (await import(deduplicationServicePath)).default;
const rateLimitService = (await import(rateLimitServicePath)).default;

describe('PatientCommunicationPreferenceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows when patient consent is true', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      allowSms: true,
      allowWhatsApp: true,
      allowEmail: true,
    });
    const result = await patientPreferenceService.checkPatientConsent('pat-1', 'SMS');
    expect(result.allowed).toBe(true);
  });

  it('blocks when patient has opted out of channel', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      allowSms: false,
      allowWhatsApp: false,
      allowEmail: true,
    });
    const result = await patientPreferenceService.checkPatientConsent('pat-1', 'SMS');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('opted out');
  });

  it('allows when no patientId is provided', async () => {
    const result = await patientPreferenceService.checkPatientConsent(null, 'SMS');
    expect(result.allowed).toBe(true);
  });

  it('blocks when patient not found', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);
    const result = await patientPreferenceService.checkPatientConsent('nonexistent', 'SMS');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Patient not found');
  });

  it('updates patient communication preferences', async () => {
    mockPrisma.patient.update.mockResolvedValue({
      id: 'pat-1',
      allowSms: false,
      allowWhatsApp: true,
      allowEmail: true,
    });
    const result = await patientPreferenceService.updatePatientConsent('pat-1', {
      allowWhatsApp: true,
    });
    expect(result).toBeDefined();
    expect(mockPrisma.patient.update).toHaveBeenCalled();
  });

  it('throws when no valid preference fields provided', async () => {
    await expect(patientPreferenceService.updatePatientConsent('pat-1', {})).rejects.toThrow(
      'No valid preference fields',
    );
  });
});

describe('ChannelFallbackService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns fallback channels for WhatsApp', () => {
    const channels = channelFallbackService.getFallbackChannels('WHATSAPP');
    expect(channels).toEqual(['SMS', 'EMAIL']);
  });

  it('returns fallback channels for SMS', () => {
    const channels = channelFallbackService.getFallbackChannels('SMS');
    expect(channels).toEqual(['EMAIL']);
  });

  it('returns empty fallback for Email', () => {
    const channels = channelFallbackService.getFallbackChannels('EMAIL');
    expect(channels).toEqual([]);
  });

  it('returns no-fallback message for channels with no fallbacks', async () => {
    const result = await channelFallbackService.executeFallback('notif-1', 'EMAIL', {
      tenantId: 't1',
      recipient: 'test@test.com',
    });
    expect(result.fallbackUsed).toBe(false);
    expect(result.message).toContain('No fallback channels');
  });
});

describe('ThrottlingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows first request within limit', async () => {
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue('OK');
    const result = await throttlingService.checkHourlyThrottle('t1', 'SMS');
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(1);
  });

  it('blocks when hourly limit exceeded', async () => {
    mockRedis.incr.mockResolvedValue(51);
    const result = await throttlingService.checkHourlyThrottle('t1', 'SMS');
    expect(result.allowed).toBe(false);
    expect(result.current).toBeGreaterThan(50);
  });

  it('returns throttle status', async () => {
    mockRedis.get.mockResolvedValue('25');
    const result = await throttlingService.getThrottleStatus('t1', 'SMS');
    expect(result.current).toBe(25);
    expect(result.channel).toBe('SMS');
  });
});

describe('NotificationOrchestratorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends notification through orchestrator end-to-end', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      allowSms: true,
      allowWhatsApp: true,
      allowEmail: true,
    });
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue('OK');
    mockPrisma.notificationPreference.findFirst.mockResolvedValue(null);
    mockPrisma.notificationTemplate.findFirst.mockResolvedValue({
      templateBody: 'Hello {{name}}',
      variables: null,
    });
    mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });
    mockRedis.set.mockResolvedValue('OK');

    const result = await orchestratorService.send({
      tenantId: 't1',
      channel: 'SMS',
      recipient: '+919876543210',
      templateName: 'REFILL_REMINDER',
      variables: { name: 'Rahul' },
      patientId: 'pat-1',
      userId: 'user-1',
      notificationType: 'REMINDER',
    });

    expect(result.success).toBe(true);
    expect(result.notificationId).toBe('notif-1');
  });

  it('skips when patient has opted out', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      allowSms: false,
      allowWhatsApp: false,
      allowEmail: true,
    });

    const result = await orchestratorService.send({
      tenantId: 't1',
      channel: 'SMS',
      recipient: '+919876543210',
      patientId: 'pat-1',
    });

    expect(result.success).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it('skips duplicate notifications', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      allowSms: true,
      allowWhatsApp: true,
      allowEmail: true,
    });
    mockRedis.get.mockResolvedValue('1');

    const result = await orchestratorService.send({
      tenantId: 't1',
      channel: 'SMS',
      recipient: '+919876543210',
      patientId: 'pat-1',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('DUPLICATE');
  });

  it('rate limits when per-recipient limit exceeded', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      allowSms: true,
      allowWhatsApp: true,
      allowEmail: true,
    });
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incr.mockResolvedValue(10);

    const result = await orchestratorService.send({
      tenantId: 't1',
      channel: 'SMS',
      recipient: '+919876543210',
      patientId: 'pat-1',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('RATE_LIMITED');
  });
});

describe('DeduplicationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when dedupe key exists', async () => {
    mockRedis.get.mockResolvedValue('1');
    const result = await deduplicationService.checkDuplicate(
      't1',
      'SMS',
      '+919876543210',
      'REFILL_REMINDER',
      'ALERT',
    );
    expect(result).toBe(true);
  });

  it('returns false when no dedupe key', async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await deduplicationService.checkDuplicate(
      't1',
      'SMS',
      '+919876543210',
      'REFILL_REMINDER',
      'ALERT',
    );
    expect(result).toBe(false);
  });

  it('marks sent with TTL', async () => {
    mockRedis.set.mockResolvedValue('OK');
    await deduplicationService.markSent('t1', 'SMS', '+919876543210', 'REFILL_REMINDER', 'ALERT');
    expect(mockRedis.set).toHaveBeenCalledWith(expect.stringContaining('dedupe'), '1', 'EX', 1800);
  });

  it('clears dedupe key', async () => {
    mockRedis.del.mockResolvedValue(1);
    await deduplicationService.clearDedupe(
      't1',
      'SMS',
      '+919876543210',
      'REFILL_REMINDER',
      'ALERT',
    );
    expect(mockRedis.del).toHaveBeenCalled();
  });
});

describe('RateLimitService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows request within limit', async () => {
    mockRedis.incr.mockResolvedValue(3);
    mockRedis.expire.mockResolvedValue('OK');
    const result = await rateLimitService.checkRateLimit('t1', 'sms', '+919876543210');
    expect(result.allowed).toBe(true);
  });

  it('blocks when limit exceeded', async () => {
    mockRedis.incr.mockResolvedValue(6);
    const result = await rateLimitService.checkRateLimit('t1', 'sms', '+919876543210');
    expect(result.allowed).toBe(false);
  });

  it('resets rate limit', async () => {
    mockRedis.del.mockResolvedValue(1);
    await rateLimitService.resetRateLimit('t1', 'sms', '+919876543210');
    expect(mockRedis.del).toHaveBeenCalled();
  });
});
