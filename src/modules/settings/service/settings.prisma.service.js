import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import settingsAuditRepository from '../gst/settings.audit.repository.js';
import { settingsEventEmitter, SettingsEvents } from '../events/settings.events.js';
import { scanKeys } from '../../../shared/utils/scan-keys.js';

const SETTINGS_CATEGORIES = [
  'inventory',
  'billing',
  'tax',
  'notifications',
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
  notifications: 'notificationSettings',
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
      const data = settings[field] || {};
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
      notifications: settings.notificationSettings || {},
      loyalty: settings.loyaltySettings || {},
      security: settings.securitySettings || {},
      invoiceTemplate: settings.invoiceTemplate || {},
      alerts: settings.alertThresholds || {},
      storeProfile: settings.storeProfile || {},
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
      throw new Error(`Invalid settings category: ${category}. Valid: ${SETTINGS_CATEGORIES.join(', ')}`);
    }

    // Get old value
    const oldSettings = await prisma.settings.findUnique({
      where: { tenantId },
      select: { [field]: true },
    });

    const oldValue = oldSettings?.[field] || null;

    // Merge with existing data
    const existing = oldSettings?.[field] || {};
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
      notifications: SettingsEvents.NOTIFICATION_SETTINGS_UPDATED,
      security: SettingsEvents.SECURITY_SETTINGS_UPDATED,
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
      if (category) {
        const cacheKey = `settings:${tenantId}:${category}:*`;
        const keys = await scanKeys(cacheKey);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } else {
        const cacheKey = `settings:${tenantId}:*`;
        const keys = await scanKeys(cacheKey);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
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
      },
    });
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
