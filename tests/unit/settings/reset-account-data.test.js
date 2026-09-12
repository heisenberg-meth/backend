import { jest, describe, afterEach, it, expect, beforeAll } from '@jest/globals';
import bcrypt from 'bcryptjs';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  scan: jest.fn().mockResolvedValue(['0', []]),
};

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../../src/config/redis.js', () => ({ default: mockRedis }));
jest.unstable_mockModule('../../../src/shared/utils/scan-keys.js', () => ({
  scanKeys: jest.fn().mockResolvedValue([]),
}));

const { default: settingsService } =
  await import('../../../src/modules/settings/service/settings.prisma.service.js');
const { default: settingsController } =
  await import('../../../src/modules/settings/controller/settings.fastify.controller.js');

describe('Master Reset / Clear Account Data Service & Controller', () => {
  const tenantId = 'tenant-123';
  const userId = 'user-owner-1';
  const plainPassword = 'CorrectPassword123!';
  let hashedPassword;

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(plainPassword, 10);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('settingsService.resetAccountData', () => {
    it('should throw error if tenant context is missing', async () => {
      await expect(settingsService.resetAccountData(null, userId, plainPassword)).rejects.toThrow(
        /tenant context required/i,
      );
    });

    it('should throw error if password is missing', async () => {
      await expect(settingsService.resetAccountData(tenantId, userId, '')).rejects.toThrow(
        /password verification is required/i,
      );
    });

    it('should throw error if user is not found or does not match tenant', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        settingsService.resetAccountData(tenantId, userId, plainPassword),
      ).rejects.toThrow(/user not found/i);
    });

    it('should throw error if user role is not OWNER or ADMIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        tenantId,
        role: 'STAFF',
        password: hashedPassword,
      });

      await expect(
        settingsService.resetAccountData(tenantId, userId, plainPassword),
      ).rejects.toThrow(/only an account owner or administrator/i);
    });

    it('should throw 401 error if password does not match', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        tenantId,
        role: 'OWNER',
        password: hashedPassword,
      });

      await expect(
        settingsService.resetAccountData(tenantId, userId, 'WrongPassword'),
      ).rejects.toThrow(/invalid account password/i);
    });

    it('should execute transaction and delete all operational records on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        tenantId,
        role: 'OWNER',
        fullName: 'Dr. Test Owner',
        email: 'owner@pharma.test',
        password: hashedPassword,
        tenant: { name: 'Apex Pharmacy' },
      });

      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const tx = {
          salesAnomaly: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          revenueHeatmap: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          revenueSnapshot: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          dailySalesSummary: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          dailyPurchaseSummary: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          dailyProcurementSummary: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          dailyFinanceSummary: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          dashboardSnapshot: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          deadStockAnalysis: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          fastMovingMedicine: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          slowMovingStock: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          outbreakPrediction: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          demandForecast: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          forecastRecommendation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          expiryRiskPrediction: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          expiryRecommendation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          expiryAlert: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          executiveInsight: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          tallyExport: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          gstSummary: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          hsnSummary: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          paymentMethodAnalytics: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          expense: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          journalEntry: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          transaction: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          cashRegisterSession: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          shift: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          delivery: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          rider: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          fileAsset: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          notificationRetryLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          smsNotification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          notification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          invoiceDeliveryLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          invoicePrintJob: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          invoiceAuditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          invoiceEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          creditNote: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          refundPayment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          paymentAllocation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          payment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          paymentSession: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          returnItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          salesReturn: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          return: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          invoiceItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          saleItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          onlineOrderItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          onlineOrder: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          invoice: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          sale: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplierCreditNoteUsage: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplierCreditNote: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplierReturnItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplierReturn: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplierPaymentAllocation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplierPayment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplierMetrics: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplierLedger: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          goodsReceiptNoteItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          goodsReceiptNote: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          purchaseInvoice: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          purchaseOrderItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          purchaseOrderApproval: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          purchaseOrderRevision: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          purchaseOrder: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          inpatientMedicationUsage: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientAdmission: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientIdentityMap: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientSegment: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientCreditLedger: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientCreditAccount: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          loyaltyTransaction: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientLoyaltyAccount: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientAuditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientRefillReminder: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientRefill: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientReminder: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientAdherence: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientBehavior: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientPrescription: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patientInsuranceClaim: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          prescriptionVerification: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          prescriptionItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          prescription: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          doctor: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          patient: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          stockMovement: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          stockTransferItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          stockTransfer: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          stockSnapshot: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          stockAlert: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          damagedStock: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          quarantinedBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          inventoryDisposal: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          inventoryReconciliation: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          inventorySyncLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          batchRecall: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          batchAuditLog: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          inventoryBatch: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          inventory: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          drugAlternative: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          drugInteraction: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          barcodeMapping: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicineBarcode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicineInventoryConfig: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicinePriceHistory: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicinePricing: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          ecommercePricing: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicineStatusHistory: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicineSubscription: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicineSupplier: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          alertThresholdOverride: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          importExtractedItem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          importJob: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicine: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          supplier: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          manufacturer: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          medicineCategory: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
          auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
        };
        await callback(tx);
      });

      const res = await settingsService.resetAccountData(tenantId, userId, plainPassword);

      expect(res.success).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('settingsController.resetAccountData', () => {
    it('should return 400 if confirmation is not RESET', async () => {
      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      const mockRequest = {
        body: { confirmation: 'reset', password: 'password' },
        tenantId,
        user: { id: userId },
      };

      await settingsController.resetAccountData(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringMatching(/RESET/i) }),
      );
    });

    it('should return 400 if password is empty', async () => {
      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };
      const mockRequest = {
        body: { confirmation: 'RESET', password: '   ' },
        tenantId,
        user: { id: userId },
      };

      await settingsController.resetAccountData(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, message: expect.stringMatching(/password/i) }),
      );
    });
  });
});
