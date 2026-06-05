import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import settingsAuditRepository from './settings.audit.repository.js';
import { settingsEventEmitter, SettingsEvents } from '../events/settings.events.js';
import {
  validateNoDuplicateCategories,
  validateGstSlab,
  calculateTaxBreakdown,
} from '../validators/gst.validator.js';

class GstSettingsService {
  async getGstSettings(tenantId, branchId = null) {
    const cacheKey = `settings:gst:${tenantId}:${branchId || 'global'}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn({ err }, 'Redis cache read failed for GST settings');
    }

    const where = { tenantId, isActive: true };
    if (branchId) {
      where.branchId = branchId;
    } else {
      where.branchId = null; // Global settings only
    }

    const gstSettings = await prisma.gstSetting.findMany({
      where,
      orderBy: { category: 'asc' },
    });

    // Get default GST from tenant settings
    const tenantSettings = await prisma.settings.findUnique({
      where: { tenantId },
      select: { taxSettings: true },
    });

    const defaultGST = tenantSettings?.taxSettings?.defaultGST ?? 12;
    const igstEnabled = tenantSettings?.taxSettings?.igstEnabled ?? true;

    const result = {
      defaultGST,
      igstEnabled,
      branchId,
      categories: gstSettings.map((s) => ({
        id: s.id,
        category: s.category,
        gstPercentage: Number(s.gstPercentage),
        cgstPercentage: Number(s.cgstPercentage),
        sgstPercentage: Number(s.sgstPercentage),
        igstPercentage: Number(s.igstPercentage),
        effectiveFrom: s.effectiveFrom,
        effectiveTo: s.effectiveTo,
        notes: s.notes,
      })),
    };

    // Cache for 1 hour
    try {
      await redisClient.set(cacheKey, JSON.stringify(result), 'EX', 3600);
    } catch (err) {
      logger.warn({ err }, 'Redis cache write failed for GST settings');
    }

    return result;
  }

  /**
   * Update GST settings with versioning and audit logging.
   * This is a high-risk financial operation — all changes are tracked.
   */
  async updateGstSettings(tenantId, data, changedBy = null, ipAddress = null) {
    const { categories, defaultGST, igstEnabled, branchId, effectiveFrom, notes } = data;

    // Validate no duplicate categories
    if (categories && categories.length > 0) {
      const dupCheck = validateNoDuplicateCategories(categories);
      if (!dupCheck.valid) {
        throw new Error(dupCheck.error);
      }

      // Validate each GST slab
      for (const cat of categories) {
        const slabCheck = validateGstSlab(cat.gstPercentage);
        if (!slabCheck.valid) {
          throw new Error(slabCheck.error);
        }
      }
    }

    // Start transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Update default GST in tenant settings
      if (defaultGST !== undefined || igstEnabled !== undefined) {
        const tenantSettings = await tx.settings.findUnique({
          where: { tenantId },
          select: { taxSettings: true },
        });

        const currentTaxSettings = tenantSettings?.taxSettings || {};
        const newTaxSettings = {
          ...currentTaxSettings,
          ...(defaultGST !== undefined && { defaultGST }),
          ...(igstEnabled !== undefined && { igstEnabled }),
        };

        const oldValue = { ...currentTaxSettings };

        await tx.settings.upsert({
          where: { tenantId },
          update: { taxSettings: newTaxSettings },
          create: { tenantId, taxSettings: newTaxSettings },
        });

        // Audit log for default GST change
        await settingsAuditRepository.logChange({
          tenantId,
          settingKey: 'gst',
          action: 'UPDATED',
          category: 'DEFAULT',
          branchId: branchId || null,
          oldValue,
          newValue: newTaxSettings,
          changedBy,
          ipAddress,
        });
      }

      // Update category-specific GST settings
      const updatedCategories = [];
      if (categories && categories.length > 0) {
        for (const cat of categories) {
          const cgst = cat.gstPercentage / 2;
          const sgst = cat.gstPercentage / 2;

          // Get old value for audit
          const existing = await tx.gstSetting.findFirst({
            where: {
              tenantId,
              branchId: branchId || null,
              category: cat.category,
              isActive: true,
            },
          });

          const oldValue = existing
            ? {
                category: existing.category,
                gstPercentage: Number(existing.gstPercentage),
              }
            : null;

          // Upsert the GST setting
          const setting = await tx.gstSetting.upsert({
            where: {
              tenantId_branchId_category_effectiveFrom: {
                tenantId,
                branchId: branchId || null,
                category: cat.category,
                effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
              },
            },
            update: {
              gstPercentage: cat.gstPercentage,
              cgstPercentage: cgst,
              sgstPercentage: sgst,
              igstPercentage: cat.gstPercentage,
              notes: notes || existing?.notes,
            },
            create: {
              tenantId,
              branchId: branchId || null,
              category: cat.category,
              gstPercentage: cat.gstPercentage,
              cgstPercentage: cgst,
              sgstPercentage: sgst,
              igstPercentage: cat.gstPercentage,
              effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
              notes,
              createdBy: changedBy,
            },
          });

          // Create version entry
          const versionCount = await tx.gstSettingVersion.count({
            where: { gstSettingId: setting.id },
          });

          await tx.gstSettingVersion.create({
            data: {
              tenantId,
              gstSettingId: setting.id,
              versionNumber: versionCount + 1,
              category: cat.category,
              gstPercentage: cat.gstPercentage,
              cgstPercentage: cgst,
              sgstPercentage: sgst,
              igstPercentage: cat.gstPercentage,
              snapshot: {
                category: cat.category,
                gstPercentage: cat.gstPercentage,
                effectiveFrom: setting.effectiveFrom,
                changedBy,
                notes,
              },
              changedBy,
              changeReason: notes || 'GST rate update',
            },
          });

          // Audit log
          await settingsAuditRepository.logChange({
            tenantId,
            settingKey: 'gst',
            action: existing ? 'UPDATED' : 'CREATED',
            category: cat.category,
            branchId: branchId || null,
            oldValue,
            newValue: {
              category: cat.category,
              gstPercentage: cat.gstPercentage,
              cgstPercentage: cgst,
              sgstPercentage: sgst,
              igstPercentage: cat.gstPercentage,
            },
            changedBy,
            ipAddress,
          });

          updatedCategories.push({
            id: setting.id,
            category: cat.category,
            gstPercentage: cat.gstPercentage,
            cgstPercentage: cgst,
            sgstPercentage: sgst,
            igstPercentage: cat.gstPercentage,
          });
        }
      }

      return { defaultGST, igstEnabled, categories: updatedCategories };
    });

    // Invalidate cache
    await this.invalidateGstCache(tenantId, branchId);

    // Emit events
    await settingsEventEmitter.emit(SettingsEvents.GST_SETTINGS_UPDATED, {
      tenantId,
      branchId,
      changedBy,
      result,
    });

    if (categories?.length > 0) {
      await settingsEventEmitter.emit(SettingsEvents.TAX_POLICY_CHANGED, {
        tenantId,
        categories: categories.map((c) => c.category),
      });
    }

    logger.info(
      { tenantId, branchId, changedBy, categories: categories?.length },
      'GST settings updated',
    );

    return result;
  }

  /**
   * Get GST version history for a category.
   * Critical for preserving historical invoice tax logic.
   */
  async getGstVersionHistory(tenantId, category, branchId = null, limit = 20) {
    const gstSetting = await prisma.gstSetting.findFirst({
      where: {
        tenantId,
        branchId: branchId || null,
        category,
      },
      select: { id: true },
    });

    if (!gstSetting) {
      return [];
    }

    return prisma.gstSettingVersion.findMany({
      where: { gstSettingId: gstSetting.id },
      orderBy: { versionNumber: 'desc' },
      take: limit,
    });
  }

  /**
   * Resolve GST rate for a medicine category at a specific point in time.
   * Used by the billing engine to calculate taxes on invoices.
   * NEVER recalculates old invoices — always uses the rate at invoice time.
   */
  async resolveGstRate(tenantId, category, invoiceDate = null, branchId = null) {
    const date = invoiceDate ? new Date(invoiceDate) : new Date();

    const gstSetting = await prisma.gstSetting.findFirst({
      where: {
        tenantId,
        branchId: branchId || null,
        category,
        isActive: true,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (!gstSetting) {
      // Fall back to default GST
      const tenantSettings = await prisma.settings.findUnique({
        where: { tenantId },
        select: { taxSettings: true },
      });
      const defaultGST = tenantSettings?.taxSettings?.defaultGST ?? 12;
      const breakdown = calculateTaxBreakdown(100, defaultGST);
      return {
        category,
        gstPercentage: defaultGST,
        cgstPercentage: defaultGST / 2,
        sgstPercentage: defaultGST / 2,
        igstPercentage: defaultGST,
        breakdown,
      };
    }

    const breakdown = calculateTaxBreakdown(100, Number(gstSetting.gstPercentage));
    return {
      category,
      gstPercentage: Number(gstSetting.gstPercentage),
      cgstPercentage: Number(gstSetting.cgstPercentage),
      sgstPercentage: Number(gstSetting.sgstPercentage),
      igstPercentage: Number(gstSetting.igstPercentage),
      breakdown,
    };
  }

  /**
   * Invalidate GST cache for a tenant/branch.
   * Called after any GST settings update.
   */
  async invalidateGstCache(tenantId, branchId = null) {
    try {
      const cacheKey = `settings:gst:${tenantId}:${branchId || 'global'}`;
      await redisClient.del(cacheKey);

      // Also invalidate billing cache
      await redisClient.del(`settings:billing:${tenantId}:all`);

      logger.debug({ tenantId, branchId }, 'GST cache invalidated');
    } catch (err) {
      logger.error({ err }, 'Failed to invalidate GST cache');
    }
  }
}

export default new GstSettingsService();
