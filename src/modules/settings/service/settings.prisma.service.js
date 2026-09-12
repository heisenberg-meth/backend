import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import settingsAuditRepository from '../gst/settings.audit.repository.js';
import { settingsEventEmitter, SettingsEvents } from '../events/settings.events.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';
import bcrypt from 'bcryptjs';

const SETTINGS_CATEGORIES = [
  'inventory',
  'billing',
  'tax',
  'loyalty',
  'security',
  'invoiceTemplate',
  'alerts',
  'storeProfile',
  'integrations',
];

const CATEGORY_FIELD_MAP = {
  inventory: 'inventorySettings',
  billing: 'billingSettings',
  tax: 'taxSettings',
  loyalty: 'loyaltySettings',
  security: 'securitySettings',
  invoiceTemplate: 'invoiceTemplate',
  alerts: 'alertThresholds',
  storeProfile: 'storeProfile',
  integrations: 'integrations',
};

class SettingsPrismaService {
  /**
   * Alias for getSettingsWithCache — matches controller expectations.
   */
  async getSettings(tenantId) {
    return this.getSettingsWithCache(tenantId);
  }

  /**
   * Get all settings for a tenant (merged from all categories).
   * Supports optional category and branch filtering.
   */
  async getSettingsWithCache(tenantId, category = null, branchId = null) {
    const cacheKey = `settings:${tenantId}:${category || 'all'}:${branchId || 'global'}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn({ err }, 'Redis cache read failed');
    }

    let settings = await prisma.settings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      settings = await this._createDefaults(tenantId);
    }

    // If a specific category is requested, return only that
    if (category && CATEGORY_FIELD_MAP[category]) {
      const field = CATEGORY_FIELD_MAP[category];
      let data = settings[field] || {};

      if (category === 'storeProfile' && Object.keys(data).length === 0) {
        data = { gstin: null, businessName: '', state: '', filingFrequency: 'Monthly' };
      } else if (category === 'invoiceTemplate' && Object.keys(data).length === 0) {
        data = {
          templateName: 'Standard',
          primaryColor: '#000000',
          showLogo: false,
          showUPI: false,
          footerText: '',
          termsAndConditions:
            '1. Goods once sold will not be taken back.\n2. All disputes subject to local jurisdiction.',
        };
      }

      const result = { category, data };

      await this._cacheSet(cacheKey, result);
      return result;
    }

    // Return all settings merged
    const result = {
      lowStock: settings.lowStock,
      expiryDays: settings.expiryDays,
      theme: settings.theme,
      autoEscalation: settings.autoEscalation,
      auditLogging: settings.auditLogging,
      inventory: settings.inventorySettings || {},
      billing: settings.billingSettings || {},
      tax: settings.taxSettings || {},
      loyalty: settings.loyaltySettings || {},
      security: settings.securitySettings || {},
      invoiceTemplate:
        Object.keys(settings.invoiceTemplate || {}).length > 0
          ? settings.invoiceTemplate
          : {
              templateName: 'Standard',
              primaryColor: '#000000',
              showLogo: false,
              showUPI: false,
              footerText: '',
              termsAndConditions:
                '1. Goods once sold will not be taken back.\n2. All disputes subject to local jurisdiction.',
            },
      alerts: settings.alertThresholds || {},
      storeProfile:
        Object.keys(settings.storeProfile || {}).length > 0
          ? settings.storeProfile
          : {
              gstin: null,
              businessName: '',
              state: '',
              filingFrequency: 'Monthly',
            },
      integrations: settings.integrations || {},
    };

    await this._cacheSet(cacheKey, result);
    return result;
  }

  /**
   * Update all settings for a tenant.
   */
  async updateSettings(tenantId, data, changedBy = null, ipAddress = null) {
    const {
      lowStock,
      expiryDays,
      theme,
      autoEscalation,
      auditLogging,
      inventory,
      billing,
      tax,
      notifications,
      loyalty,
      security,
      invoiceTemplate,
      alerts,
      storeProfile,
      integrations,
    } = data;

    // Get old values for audit
    const oldSettings = await prisma.settings.findUnique({ where: { tenantId } });

    const updateData = {};
    if (lowStock !== undefined) updateData.lowStock = lowStock;
    if (expiryDays !== undefined) updateData.expiryDays = expiryDays;
    if (theme !== undefined) updateData.theme = theme;
    if (autoEscalation !== undefined) updateData.autoEscalation = autoEscalation;
    if (auditLogging !== undefined) updateData.auditLogging = auditLogging;
    if (inventory !== undefined) updateData.inventorySettings = inventory;
    if (billing !== undefined) updateData.billingSettings = billing;
    if (tax !== undefined) updateData.taxSettings = tax;
    if (notifications !== undefined) updateData.notificationSettings = notifications;
    if (loyalty !== undefined) updateData.loyaltySettings = loyalty;
    if (security !== undefined) updateData.securitySettings = security;
    if (invoiceTemplate !== undefined) updateData.invoiceTemplate = invoiceTemplate;
    if (alerts !== undefined) updateData.alertThresholds = alerts;
    if (storeProfile !== undefined) updateData.storeProfile = storeProfile;
    if (integrations !== undefined) updateData.integrations = integrations;

    const updated = await prisma.settings.upsert({
      where: { tenantId },
      update: updateData,
      create: { tenantId, ...updateData },
    });

    // Audit log
    await settingsAuditRepository.logChange({
      tenantId,
      settingKey: 'general',
      action: 'UPDATED',
      oldValue: oldSettings,
      newValue: updated,
      changedBy,
      ipAddress,
    });

    await this.invalidateCache(tenantId);

    await settingsEventEmitter.emit(SettingsEvents.SETTINGS_CACHE_INVALIDATED, {
      tenantId,
    });

    return updated;
  }

  /**
   * Update a specific settings category.
   */
  async updateCategorySettings(tenantId, category, data, changedBy = null, ipAddress = null) {
    const field = CATEGORY_FIELD_MAP[category];
    if (!field) {
      throw new Error(
        `Invalid settings category: ${category}. Valid: ${SETTINGS_CATEGORIES.join(', ')}`,
      );
    }

    // Get old value
    const oldSettings = await prisma.settings.findUnique({
      where: { tenantId },
      select: { [field]: true },
    });

    const oldValue = oldSettings?.[field] || null;

    // Merge with existing data
    let existing = oldSettings?.[field] || {};

    if (category === 'storeProfile' && Object.keys(existing).length === 0) {
      existing = { gstin: null, businessName: '', state: '', filingFrequency: 'Monthly' };
    } else if (category === 'invoiceTemplate' && Object.keys(existing).length === 0) {
      existing = {
        templateName: 'Standard',
        primaryColor: '#000000',
        showLogo: false,
        showUPI: false,
        footerText: '',
        termsAndConditions:
          '1. Goods once sold will not be taken back.\n2. All disputes subject to local jurisdiction.',
      };
    }

    const merged = { ...existing, ...data };

    await prisma.settings.upsert({
      where: { tenantId },
      update: { [field]: merged },
      create: { tenantId, [field]: merged },
    });

    // Audit log
    await settingsAuditRepository.logChange({
      tenantId,
      settingKey: category,
      action: oldValue ? 'UPDATED' : 'CREATED',
      category,
      oldValue,
      newValue: merged,
      changedBy,
      ipAddress,
    });

    // Invalidate cache
    await this.invalidateCache(tenantId, category);

    // Emit category-specific event
    const eventMap = {
      billing: SettingsEvents.BILLING_SETTINGS_UPDATED,
      inventory: SettingsEvents.INVENTORY_SETTINGS_UPDATED,
      security: SettingsEvents.SECURITY_SETTINGS_UPDATED,
      loyalty: SettingsEvents.LOYALTY_SETTINGS_UPDATED,
      invoiceTemplate: SettingsEvents.INVOICE_TEMPLATE_UPDATED,
      storeProfile: SettingsEvents.STORE_PROFILE_UPDATED,
      alerts: SettingsEvents.ALERT_THRESHOLDS_UPDATED,
      integrations: SettingsEvents.INTEGRATIONS_UPDATED,
    };

    const event = eventMap[category];
    if (event) {
      await settingsEventEmitter.emit(event, { tenantId, category, data });
    }

    return { category, data: merged };
  }

  /**
   * Get settings audit history.
   */
  async getAuditHistory(tenantId, options = {}) {
    return settingsAuditRepository.getAuditHistory(tenantId, options);
  }

  /**
   * Invalidate Redis cache for a tenant.
   * Supports category-specific invalidation.
   */
  async invalidateCache(tenantId, category = null) {
    try {
      const keysToDelete = [];

      if (category) {
        const cacheKey = `settings:${tenantId}:${category}:*`;
        const keys = await scanKeys(cacheKey);
        keysToDelete.push(...keys);

        // Always invalidate the 'all' cache key since the global settings object has changed
        const allCacheKey = `settings:${tenantId}:all:*`;
        const allKeys = await scanKeys(allCacheKey);
        keysToDelete.push(...allKeys);
      } else {
        // If no category specified, invalidate everything for this tenant
        const cacheKey = `settings:${tenantId}:*`;
        const keys = await scanKeys(cacheKey);
        keysToDelete.push(...keys);
      }

      if (keysToDelete.length > 0) {
        await redisClient.del(...keysToDelete);
      }
    } catch (err) {
      logger.error({ err }, 'Redis cache invalidation failed');
    }
  }

  /**
   * Create default settings for a new tenant.
   */
  async _createDefaults(tenantId) {
    return prisma.settings.create({
      data: {
        tenantId,
        lowStock: 10,
        expiryDays: 30,
        theme: 'dark',
        autoEscalation: true,
        auditLogging: false,
        inventorySettings: {
          lowStockThreshold: 10,
          expiryAlertDays: 30,
          autoReorderEnabled: false,
          fifoEnabled: true,
          batchTrackingEnabled: true,
        },
        billingSettings: {
          invoicePrefix: 'INV',
          autoGenerateInvoice: true,
          roundOffEnabled: true,
          autoApplyGST: true,
          showTaxBreakdown: true,
        },
        taxSettings: {
          defaultGST: 12,
          igstEnabled: true,
        },
        notificationSettings: {
          emailEnabled: true,
          inAppEnabled: true,
          lowStockAlert: true,
          expiryAlert: true,
        },
        securitySettings: {
          sessionTimeout: 30,
          maxLoginAttempts: 5,
          passwordMinLength: 8,
          auditLogging: false,
        },
        storeProfile: {
          gstin: null,
          businessName: '',
          state: '',
          filingFrequency: 'Monthly',
        },
        invoiceTemplate: {
          templateName: 'Standard',
          primaryColor: '#000000',
          showLogo: false,
          showUPI: false,
          footerText: '',
          termsAndConditions:
            '1. Goods once sold will not be taken back.\n2. All disputes subject to local jurisdiction.',
        },
      },
    });
  }

  /**
   * Destructively reset all operational data for a tenant while preserving
   * the tenant identity, user credentials, subscription and configuration.
   *
   * @param {string} tenantId - Tenant ID derived from authenticated session
   * @param {string} userId - User ID performing the action
   * @param {string} password - User password for authentication confirmation
   */
  async resetAccountData(tenantId, userId, password) {
    if (!tenantId) {
      const err = new Error('Tenant context required for account data reset');
      err.statusCode = 400;
      throw err;
    }

    if (!password) {
      const err = new Error('Password verification is required for account data reset');
      err.statusCode = 400;
      throw err;
    }

    // Verify user credentials & authorization
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });

    if (!user || user.tenantId !== tenantId) {
      const err = new Error('User not found or does not belong to this tenant');
      err.statusCode = 403;
      throw err;
    }

    if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
      const err = new Error(
        'Only an account owner or administrator can reset pharmacy operational data',
      );
      err.statusCode = 403;
      throw err;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      const err = new Error('Invalid account password. Reset aborted.');
      err.statusCode = 401;
      throw err;
    }

    logger.warn(
      { tenantId, userId, email: user.email },
      'Beginning transactional Master Reset of tenant operational data',
    );

    // Execute atomic transactional reset honoring foreign key hierarchy
    await prisma.$transaction(
      async (tx) => {
        // 1. Predictive Analytics, Metrics & Summaries
        await tx.salesAnomaly.deleteMany({ where: { tenantId } });
        await tx.revenueHeatmap.deleteMany({ where: { tenantId } });
        await tx.revenueSnapshot.deleteMany({ where: { tenantId } });
        await tx.dailySalesSummary.deleteMany({ where: { tenantId } });
        await tx.dailyPurchaseSummary.deleteMany({ where: { tenantId } });
        await tx.dailyProcurementSummary.deleteMany({ where: { tenantId } });
        await tx.dailyFinanceSummary.deleteMany({ where: { tenantId } });
        await tx.dashboardSnapshot.deleteMany({ where: { tenantId } });
        await tx.deadStockAnalysis.deleteMany({ where: { tenantId } });
        await tx.fastMovingMedicine.deleteMany({ where: { tenantId } });
        await tx.slowMovingStock.deleteMany({ where: { tenantId } });
        await tx.outbreakPrediction.deleteMany({ where: { tenantId } });
        await tx.demandForecast.deleteMany({ where: { tenantId } });
        await tx.forecastRecommendation.deleteMany({ where: { tenantId } });
        await tx.expiryRiskPrediction.deleteMany({ where: { tenantId } });
        await tx.expiryRecommendation.deleteMany({ where: { tenantId } });
        await tx.expiryAlert.deleteMany({ where: { tenantId } });
        await tx.executiveInsight.deleteMany({ where: { tenantId } });
        await tx.tallyExport.deleteMany({ where: { tenantId } });
        await tx.gstSummary.deleteMany({ where: { tenantId } });
        await tx.hsnSummary.deleteMany({ where: { tenantId } });
        await tx.paymentMethodAnalytics.deleteMany({ where: { tenantId } });

        // 2. Financial & Accounting Operational Records
        await tx.expense.deleteMany({ where: { tenantId } });
        await tx.journalEntry.deleteMany({ where: { tenantId } });
        await tx.transaction.deleteMany({ where: { tenantId } });
        await tx.cashRegisterSession.deleteMany({ where: { tenantId } });
        await tx.shift.deleteMany({ where: { tenantId } });

        // 3. Deliveries, Riders & Logistics
        await tx.delivery.deleteMany({ where: { tenantId } });
        await tx.rider.deleteMany({ where: { tenantId } });

        // 4. File Assets linked to tenant
        await tx.fileAsset.deleteMany({ where: { tenantId } });

        // 5. Notifications & Retry Logs
        await tx.notificationRetryLog.deleteMany({ where: { tenantId } });
        await tx.smsNotification.deleteMany({ where: { tenantId } });
        await tx.notification.deleteMany({ where: { tenantId } });

        // 6. Invoices, Payments, Sales & Returns
        await tx.invoiceDeliveryLog.deleteMany({ where: { tenantId } });
        await tx.invoicePrintJob.deleteMany({ where: { tenantId } });
        await tx.invoiceAuditLog.deleteMany({ where: { tenantId } });
        await tx.invoiceEvent.deleteMany({ where: { invoice: { tenantId } } });
        await tx.creditNote.deleteMany({ where: { tenantId } });
        await tx.refundPayment.deleteMany({ where: { tenantId } });
        await tx.paymentAllocation.deleteMany({ where: { tenantId } });
        await tx.payment.deleteMany({ where: { tenantId } });
        await tx.paymentSession.deleteMany({ where: { tenantId } });
        await tx.returnItem.deleteMany({ where: { return: { tenantId } } });
        await tx.salesReturn.deleteMany({ where: { tenantId } });
        await tx.return.deleteMany({ where: { tenantId } });
        await tx.invoiceItem.deleteMany({ where: { invoice: { tenantId } } });
        await tx.saleItem.deleteMany({ where: { sale: { tenantId } } });
        await tx.onlineOrderItem.deleteMany({ where: { tenantId } });
        await tx.onlineOrder.deleteMany({ where: { tenantId } });
        await tx.invoice.deleteMany({ where: { tenantId } });
        await tx.sale.deleteMany({ where: { tenantId } });

        // 7. Suppliers & Procurement
        await tx.supplierCreditNoteUsage.deleteMany({ where: { creditNote: { tenantId } } });
        await tx.supplierCreditNote.deleteMany({ where: { tenantId } });
        await tx.supplierReturnItem.deleteMany({ where: { return: { tenantId } } });
        await tx.supplierReturn.deleteMany({ where: { tenantId } });
        await tx.supplierPaymentAllocation.deleteMany({ where: { tenantId } });
        await tx.supplierPayment.deleteMany({ where: { tenantId } });
        await tx.supplierMetrics.deleteMany({ where: { supplier: { tenantId } } });
        await tx.supplierLedger.deleteMany({ where: { tenantId } });
        await tx.goodsReceiptNoteItem.deleteMany({ where: { grn: { tenantId } } });
        await tx.goodsReceiptNote.deleteMany({ where: { tenantId } });
        await tx.purchaseInvoice.deleteMany({ where: { tenantId } });
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { tenantId } } });
        await tx.purchaseOrderApproval.deleteMany({ where: { purchaseOrder: { tenantId } } });
        await tx.purchaseOrderRevision.deleteMany({ where: { purchaseOrder: { tenantId } } });
        await tx.purchaseOrder.deleteMany({ where: { tenantId } });

        // 8. Patient Records, Prescriptions & Loyalty
        await tx.inpatientMedicationUsage.deleteMany({ where: { admission: { tenantId } } });
        await tx.patientAdmission.deleteMany({ where: { tenantId } });
        await tx.patientIdentityMap.deleteMany({ where: { patient: { tenantId } } });
        await tx.patientSegment.deleteMany({ where: { patient: { tenantId } } });
        await tx.patientCreditLedger.deleteMany({ where: { tenantId } });
        await tx.patientCreditAccount.deleteMany({ where: { tenantId } });
        await tx.loyaltyTransaction.deleteMany({ where: { tenantId } });
        await tx.patientLoyaltyAccount.deleteMany({ where: { tenantId } });
        await tx.patientAuditLog.deleteMany({ where: { tenantId } });
        await tx.patientRefillReminder.deleteMany({ where: { tenantId } });
        await tx.patientRefill.deleteMany({ where: { tenantId } });
        await tx.patientReminder.deleteMany({ where: { tenantId } });
        await tx.patientAdherence.deleteMany({ where: { tenantId } });
        await tx.patientBehavior.deleteMany({ where: { tenantId } });
        await tx.patientPrescription.deleteMany({ where: { tenantId } });
        await tx.patientInsuranceClaim.deleteMany({ where: { tenantId } });
        await tx.prescriptionVerification.deleteMany({ where: { prescription: { tenantId } } });
        await tx.prescriptionItem.deleteMany({ where: { prescription: { tenantId } } });
        await tx.prescription.deleteMany({ where: { tenantId } });
        await tx.doctor.deleteMany({ where: { tenantId } });
        await tx.patient.deleteMany({ where: { tenantId } });

        // 9. Stock, Batches & Inventory
        await tx.stockMovement.deleteMany({ where: { tenantId } });
        await tx.stockTransferItem.deleteMany({ where: { transfer: { tenantId } } });
        await tx.stockTransfer.deleteMany({ where: { tenantId } });
        await tx.stockSnapshot.deleteMany({ where: { tenantId } });
        await tx.stockAlert.deleteMany({ where: { tenantId } });
        await tx.damagedStock.deleteMany({ where: { tenantId } });
        await tx.quarantinedBatch.deleteMany({ where: { batch: { tenantId } } });
        await tx.inventoryDisposal.deleteMany({ where: { tenantId } });
        await tx.inventoryReconciliation.deleteMany({ where: { tenantId } });
        await tx.inventorySyncLog.deleteMany({ where: { tenantId } });
        await tx.batchRecall.deleteMany({ where: { tenantId } });
        await tx.batchAuditLog.deleteMany({ where: { tenantId } });
        await tx.inventoryBatch.deleteMany({ where: { tenantId } });
        await tx.inventory.deleteMany({ where: { tenantId } });

        // 10. Medicine Catalog & Categories
        await tx.drugAlternative.deleteMany({ where: { tenantId } });
        await tx.drugInteraction.deleteMany({ where: { tenantId } });
        await tx.barcodeMapping.deleteMany({ where: { medicine: { tenantId } } });
        await tx.medicineBarcode.deleteMany({ where: { tenantId } });
        await tx.medicineInventoryConfig.deleteMany({ where: { tenantId } });
        await tx.medicinePriceHistory.deleteMany({ where: { tenantId } });
        await tx.medicinePricing.deleteMany({ where: { tenantId } });
        await tx.ecommercePricing.deleteMany({ where: { tenantId } });
        await tx.medicineStatusHistory.deleteMany({ where: { tenantId } });
        await tx.medicineSubscription.deleteMany({ where: { tenantId } });
        await tx.medicineSupplier.deleteMany({ where: { tenantId } });
        await tx.alertThresholdOverride.deleteMany({ where: { tenantId } });
        await tx.importExtractedItem.deleteMany({
          where: {
            importJob: {
              tenantId,
            },
          },
        });
        await tx.importJob.deleteMany({ where: { tenantId } });
        await tx.medicine.deleteMany({ where: { tenantId } });
        await tx.supplier.deleteMany({ where: { tenantId } });
        await tx.manufacturer.deleteMany({ where: { tenantId } });
        await tx.medicineCategory.deleteMany({ where: { tenantId } });

        // 11. Record Security Audit Log
        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            username: user.fullName || user.email,
            shopName: user.tenant?.name || 'Pharmacy',
            action: 'ACCOUNT_DATA_RESET',
            target: 'All operational records reset',
            type: 'SECURITY',
          },
        });
      },
      { timeout: 30000 },
    );

    // Invalidate Redis caches for this tenant
    try {
      const keys = await scanKeys(`*${tenantId}*`);
      if (keys && keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (cacheErr) {
      logger.warn({ cacheErr }, 'Cache invalidation warning after account data reset');
    }

    await this.invalidateCache(tenantId);

    logger.info(
      { tenantId, userId },
      'Master Reset completed successfully. All operational data cleared.',
    );

    return {
      success: true,
      message:
        'Operational pharmacy data reset successfully. All account credentials remain active.',
    };
  }

  /**
   * Set cache with error handling.
   */
  async _cacheSet(key, value) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', 3600);
    } catch (err) {
      logger.warn({ err }, 'Redis cache write failed');
    }
  }
}

export default new SettingsPrismaService();
