import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const redisPath = path.resolve(__dirname, '../../../config/redis.js');
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const alertSettingsPath = path.resolve(
  __dirname,
  '../../alert-settings/services/alert-settings.service.js',
);
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const eventsPath = path.resolve(__dirname, '../../../shared/constants/events.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');

const severityEnginePath = path.resolve(__dirname, '../services/severity-engine.service.js');
const workflowPath = path.resolve(__dirname, '../services/workflow.service.js');
const escalationPath = path.resolve(__dirname, '../services/escalation-engine.service.js');
const dedupPath = path.resolve(__dirname, '../services/deduplication.service.js');

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  keys: jest.fn(),
};

const mockAlertSettingsService = {
  getEffectiveThresholds: jest.fn().mockResolvedValue({
    lowStock: 20,
    criticalStock: 5,
    expiryWarning: 30,
    criticalExpiry: 7,
    autoRaisePO: false,
    escalationHours: 24,
  }),
};

const mockPrisma = {
  stockAlert: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  expiryAlert: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  alertSettings: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  alertThresholdOverride: {
    findUnique: jest.fn(),
  },
  inventoryBatch: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  medicine: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  invoiceItem: {
    aggregate: jest.fn(),
  },
  medicineSupplier: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  purchaseOrder: {
    create: jest.fn(),
  },
  tenant: {
    findMany: jest.fn(),
  },
};

const mockEmitLocalEvent = jest.fn();

jest.unstable_mockModule(redisPath, () => ({
  default: mockRedis,
}));

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(alertSettingsPath, () => ({
  default: mockAlertSettingsService,
}));

jest.unstable_mockModule(localEventBusPath, () => ({
  emitLocalEvent: mockEmitLocalEvent,
  localEventBus: { removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule(eventsPath, () => ({
  DOMAIN_EVENTS: {
    ALERT_CREATED: 'alert.lifecycle.created',
    ALERT_ESCALATED: 'alert.lifecycle.escalated',
    ALERT_SNOOZED: 'alert.lifecycle.snoozed',
    ALERT_RESOLVED: 'alert.lifecycle.resolved',
    PURCHASE_ORDER_RAISED: 'alert.procurement.raised',
    STOCK_LOW: 'inventory.stock.low',
    STOCK_EXPIRED: 'inventory.stock.expired',
  },
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const severityEngineModule = await import(severityEnginePath);
const workflowModule = await import(workflowPath);
const escalationModule = await import(escalationPath);
const dedupModule = await import(dedupPath);

const alertSeverityEngine = severityEngineModule.default;
const alertWorkflowService = workflowModule.default;
const alertEscalationEngine = escalationModule.default;
const alertDeduplicationService = dedupModule.default;

describe('Alert Severity Engine', () => {
  describe('calculateStockSeverity', () => {
    it('should return CRITICAL for <= 0 days', () => {
      expect(alertSeverityEngine.calculateStockSeverity(0)).toBe('CRITICAL');
      expect(alertSeverityEngine.calculateStockSeverity(-5)).toBe('CRITICAL');
    });

    it('should return CRITICAL for < 3 days', () => {
      expect(alertSeverityEngine.calculateStockSeverity(1)).toBe('CRITICAL');
      expect(alertSeverityEngine.calculateStockSeverity(2)).toBe('CRITICAL');
    });

    it('should return HIGH for 3-7 days', () => {
      expect(alertSeverityEngine.calculateStockSeverity(3)).toBe('HIGH');
      expect(alertSeverityEngine.calculateStockSeverity(7)).toBe('HIGH');
    });

    it('should return MEDIUM for 7-15 days', () => {
      expect(alertSeverityEngine.calculateStockSeverity(8)).toBe('MEDIUM');
      expect(alertSeverityEngine.calculateStockSeverity(15)).toBe('MEDIUM');
    });

    it('should return LOW for > 15 days', () => {
      expect(alertSeverityEngine.calculateStockSeverity(16)).toBe('LOW');
      expect(alertSeverityEngine.calculateStockSeverity(30)).toBe('LOW');
    });
  });

  describe('calculateExpirySeverity', () => {
    it('should return CRITICAL for <= 0 days', () => {
      expect(alertSeverityEngine.calculateExpirySeverity(0)).toBe('CRITICAL');
      expect(alertSeverityEngine.calculateExpirySeverity(-10)).toBe('CRITICAL');
    });

    it('should return CRITICAL for <= 15 days', () => {
      expect(alertSeverityEngine.calculateExpirySeverity(1)).toBe('CRITICAL');
      expect(alertSeverityEngine.calculateExpirySeverity(15)).toBe('CRITICAL');
    });

    it('should return WARNING for 16-30 days', () => {
      expect(alertSeverityEngine.calculateExpirySeverity(16)).toBe('WARNING');
      expect(alertSeverityEngine.calculateExpirySeverity(30)).toBe('WARNING');
    });

    it('should return INFO for > 30 days', () => {
      expect(alertSeverityEngine.calculateExpirySeverity(31)).toBe('INFO');
      expect(alertSeverityEngine.calculateExpirySeverity(90)).toBe('INFO');
    });
  });

  describe('calculateExpiryRiskValue', () => {
    it('should calculate risk value from quantity and unit cost', async () => {
      mockPrisma.inventoryBatch.findUnique.mockResolvedValue({
        quantity: 100,
        purchasePrice: 5.5,
        expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      });

      const result = await alertSeverityEngine.calculateExpiryRiskValue('batch-1');

      expect(result.riskValue).toBe(550);
      expect(result.daysRemaining).toBe(10);
      expect(result.severity).toBe('WARNING');
    });

    it('should return null when batch not found', async () => {
      mockPrisma.inventoryBatch.findUnique.mockResolvedValue(null);

      const result = await alertSeverityEngine.calculateExpiryRiskValue('invalid');

      expect(result).toBeNull();
    });
  });
});

describe('Alert Deduplication Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkDuplicate', () => {
    it('should return true when dedupe key exists', async () => {
      mockRedis.get.mockResolvedValue('1');

      const result = await alertDeduplicationService.checkDuplicate('t1', 'm1', 'b1', 'LOW_STOCK');

      expect(result).toBe(true);
    });

    it('should return false when dedupe key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await alertDeduplicationService.checkDuplicate('t1', 'm1', 'b1', 'LOW_STOCK');

      expect(result).toBe(false);
    });
  });

  describe('markProcessed', () => {
    it('should set dedupe key with TTL', async () => {
      await alertDeduplicationService.markProcessed('t1', 'm1', 'b1', 'LOW_STOCK');

      expect(mockRedis.set).toHaveBeenCalledWith(
        'alert:dedupe:t1:m1:b1:LOW_STOCK',
        '1',
        'EX',
        3600,
      );
    });
  });

  describe('trackEscalation', () => {
    it('should increment escalation count', async () => {
      mockRedis.incr.mockResolvedValue(2);

      const count = await alertDeduplicationService.trackEscalation('alert-1', 't1');

      expect(count).toBe(2);
    });
  });

  describe('setSnoozeExpiry', () => {
    it('should set snooze key with correct TTL', async () => {
      const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await alertDeduplicationService.setSnoozeExpiry('alert-1', 't1', futureDate);

      expect(mockRedis.set).toHaveBeenCalled();
    });
  });

  describe('clearDedupe', () => {
    it('should remove dedupe key', async () => {
      await alertDeduplicationService.clearDedupe('t1', 'm1', 'b1', 'LOW_STOCK');

      expect(mockRedis.del).toHaveBeenCalledWith('alert:dedupe:t1:m1:b1:LOW_STOCK');
    });
  });
});

describe('Alert Workflow Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockPrisma.invoiceItem.aggregate.mockResolvedValue({ _sum: { quantity: 300 } });
    mockPrisma.medicine.findUnique.mockResolvedValue({
      prescriptionRequired: false,
      scheduleType: null,
      categoryId: null,
    });
    mockPrisma.alertSettings.findUnique.mockResolvedValue({
      lowStockThreshold: 20,
      criticalStockThreshold: 5,
      expiryWarningDays: 30,
      criticalExpiryDays: 7,
    });
  });

  describe('createAlert', () => {
    it('should create alert with predictive severity', async () => {
      mockPrisma.stockAlert.create.mockResolvedValue({
        id: 'alert-1',
        type: 'LOW_STOCK',
        severity: 'HIGH',
        alertStatus: 'ACTIVE',
        medicine: { name: 'Dolo 650' },
      });

      const result = await alertWorkflowService.createAlert({
        tenantId: 't1',
        medicineId: 'm1',
        branchId: 'b1',
        type: 'LOW_STOCK',
        currentStock: 5,
        thresholdValue: 20,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.stockAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertStatus: 'ACTIVE',
          }),
        }),
      );
      expect(mockEmitLocalEvent).toHaveBeenCalledWith(
        'alert.lifecycle.created',
        expect.any(Object),
      );
    });

    it('should suppress duplicate alerts', async () => {
      mockRedis.get.mockResolvedValue('1');

      const result = await alertWorkflowService.createAlert({
        tenantId: 't1',
        medicineId: 'm1',
        branchId: 'b1',
        type: 'LOW_STOCK',
        currentStock: 5,
        thresholdValue: 20,
      });

      expect(result).toBeNull();
    });
  });

  describe('snoozeAlert', () => {
    it('should snooze alert with valid future date', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      mockPrisma.stockAlert.findFirst.mockResolvedValue({
        id: 'alert-1',
        isResolved: false,
      });
      mockPrisma.stockAlert.update.mockResolvedValue({
        id: 'alert-1',
        alertStatus: 'SNOOZED',
        snoozedUntil: futureDate,
      });

      const result = await alertWorkflowService.snoozeAlert('alert-1', 't1', 'user-1', {
        snoozedUntil: futureDate.toISOString(),
        reason: 'Delivery expected tomorrow',
      });

      expect(result.alertStatus).toBe('SNOOZED');
      expect(mockEmitLocalEvent).toHaveBeenCalledWith(
        'alert.lifecycle.snoozed',
        expect.any(Object),
      );
    });

    it('should reject snooze exceeding maximum duration', async () => {
      const farFuture = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);

      mockPrisma.stockAlert.findFirst.mockResolvedValue({ id: 'alert-1', isResolved: false });

      await expect(
        alertWorkflowService.snoozeAlert('alert-1', 't1', 'user-1', {
          snoozedUntil: farFuture.toISOString(),
        }),
      ).rejects.toThrow('Maximum snooze duration');
    });

    it('should reject snooze with past date', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      mockPrisma.stockAlert.findFirst.mockResolvedValue({ id: 'alert-1', isResolved: false });

      await expect(
        alertWorkflowService.snoozeAlert('alert-1', 't1', 'user-1', {
          snoozedUntil: pastDate.toISOString(),
        }),
      ).rejects.toThrow('Snooze date must be in the future');
    });

    it('should reject snooze on resolved alert', async () => {
      mockPrisma.stockAlert.findFirst.mockResolvedValue({ id: 'alert-1', isResolved: true });

      await expect(
        alertWorkflowService.snoozeAlert('alert-1', 't1', 'user-1', {
          snoozedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
      ).rejects.toThrow('Cannot snooze resolved alert');
    });
  });

  describe('resolveAlert', () => {
    it('should mark alert as resolved and clear dedupe', async () => {
      mockPrisma.stockAlert.findFirst.mockResolvedValue({
        id: 'alert-1',
        medicineId: 'm1',
        branchId: 'b1',
        type: 'LOW_STOCK',
      });
      mockPrisma.stockAlert.update.mockResolvedValue({
        id: 'alert-1',
        isResolved: true,
        alertStatus: 'RESOLVED',
      });

      const result = await alertWorkflowService.resolveAlert('alert-1', 't1', 'user-1', {
        note: 'Stock replenished',
      });

      expect(result.isResolved).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('raisePurchaseOrder', () => {
    it('should create PO with supplier recommendation', async () => {
      mockPrisma.stockAlert.findFirst.mockResolvedValue({
        id: 'alert-1',
        medicineId: 'm1',
        branchId: 'b1',
        message: 'Low stock',
        medicine: {
          name: 'Dolo 650',
          unitPrice: 10,
          gstPercentage: 12,
          reorderLevel: 20,
        },
      });

      mockPrisma.medicineSupplier.findFirst.mockResolvedValue({
        supplierId: 'sup-1',
        leadDays: 7,
        averagePurchasePrice: 8,
        supplier: { name: 'PharmaCorp', email: 'orders@pharma.com' },
      });

      mockPrisma.purchaseOrder.create.mockResolvedValue({
        id: 'po-1',
        orderNumber: 'PO-20260519-M1',
        supplierId: 'sup-1',
        status: 'DRAFT',
        totalAmount: 896,
      });

      const result = await alertWorkflowService.raisePurchaseOrder('alert-1', 't1', 'user-1', {
        priority: 'HIGH',
      });

      expect(result.orderNumber).toBeDefined();
      expect(mockEmitLocalEvent).toHaveBeenCalledWith(
        'alert.procurement.raised',
        expect.any(Object),
      );
    });

    it('should throw error when alert not found', async () => {
      mockPrisma.stockAlert.findFirst.mockResolvedValue(null);

      await expect(
        alertWorkflowService.raisePurchaseOrder('invalid', 't1', 'user-1'),
      ).rejects.toThrow('Alert not found');
    });
  });

  describe('acknowledgeAlert', () => {
    it('should mark alert as acknowledged', async () => {
      mockPrisma.stockAlert.findFirst.mockResolvedValue({ id: 'alert-1' });
      mockPrisma.stockAlert.update.mockResolvedValue({
        id: 'alert-1',
        alertStatus: 'ACKNOWLEDGED',
      });

      const result = await alertWorkflowService.acknowledgeAlert('alert-1', 't1', 'user-1', {
        note: 'Reviewed',
      });

      expect(result.alertStatus).toBe('ACKNOWLEDGED');
    });

    it('should mark alert as ON_ORDER when purchaseOrderId provided', async () => {
      mockPrisma.stockAlert.findFirst.mockResolvedValue({ id: 'alert-1' });
      mockPrisma.stockAlert.update.mockResolvedValue({
        id: 'alert-1',
        alertStatus: 'ON_ORDER',
        purchaseOrderId: 'po-1',
      });

      const result = await alertWorkflowService.acknowledgeAlert('alert-1', 't1', 'user-1', {
        purchaseOrderId: 'po-1',
      });

      expect(result.alertStatus).toBe('ON_ORDER');
    });
  });
});

describe('Alert Escalation Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateAndEscalate', () => {
    it('should escalate unresolved critical alert', async () => {
      mockPrisma.stockAlert.findUnique.mockResolvedValue({
        id: 'alert-1',
        severity: 'CRITICAL',
        isResolved: false,
        escalationCount: 0,
        medicine: { name: 'Insulin', prescriptionRequired: true },
      });
      mockPrisma.stockAlert.update.mockResolvedValue({
        id: 'alert-1',
        alertStatus: 'ESCALATED',
        escalationCount: 1,
      });
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue('OK');

      const result = await alertEscalationEngine.evaluateAndEscalate('alert-1', 't1');

      expect(result.alertStatus).toBe('ESCALATED');
      expect(mockEmitLocalEvent).toHaveBeenCalledWith(
        'alert.lifecycle.escalated',
        expect.any(Object),
      );
    });

    it('should not escalate when max escalations reached', async () => {
      mockPrisma.stockAlert.findUnique.mockResolvedValue({
        id: 'alert-1',
        severity: 'CRITICAL',
        isResolved: false,
        escalationCount: 5,
        medicine: { name: 'Insulin' },
      });

      const result = await alertEscalationEngine.evaluateAndEscalate('alert-1', 't1');

      expect(result).toBeNull();
    });

    it('should not escalate resolved alerts', async () => {
      mockPrisma.stockAlert.findUnique.mockResolvedValue({
        id: 'alert-1',
        severity: 'CRITICAL',
        isResolved: true,
        escalationCount: 0,
      });

      const result = await alertEscalationEngine.evaluateAndEscalate('alert-1', 't1');

      expect(result).toBeNull();
    });
  });

  describe('autoReactivateSnoozedAlerts', () => {
    it('should reactivate alerts with expired snooze', async () => {
      mockPrisma.stockAlert.findMany.mockResolvedValue([
        { id: 'alert-1', snoozedUntil: new Date(Date.now() - 1000) },
        { id: 'alert-2', snoozedUntil: new Date(Date.now() - 2000) },
      ]);
      mockPrisma.stockAlert.update.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(1);

      const count = await alertEscalationEngine.autoReactivateSnoozedAlerts('t1');

      expect(count).toBe(2);
      expect(mockPrisma.stockAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertStatus: 'ACTIVE',
            snoozedUntil: null,
          }),
        }),
      );
    });
  });

  describe('reopenCancelledPOAlerts', () => {
    it('should reopen alerts when PO is cancelled', async () => {
      mockPrisma.stockAlert.findMany.mockResolvedValue([
        { id: 'alert-1', medicineId: 'm1', branchId: 'b1', type: 'LOW_STOCK' },
      ]);
      mockPrisma.stockAlert.update.mockResolvedValue({});
      mockRedis.del.mockResolvedValue(1);

      const count = await alertEscalationEngine.reopenCancelledPOAlerts('t1', 'po-1');

      expect(count).toBe(1);
      expect(mockPrisma.stockAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alertStatus: 'ACTIVE',
            purchaseOrderId: null,
          }),
        }),
      );
    });
  });
});
