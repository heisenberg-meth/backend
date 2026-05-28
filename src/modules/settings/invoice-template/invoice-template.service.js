import prisma from '../../../config/prisma.js';
import settingsPrismaService from '../service/settings.prisma.service.js';
import { settingsEventEmitter, SettingsEvents } from '../events/settings.events.js';

class InvoiceTemplateService {
  /**
   * Get current invoice template configuration
   */
  async getTemplate(tenantId) {
    const result = await settingsPrismaService.getSettingsWithCache(tenantId, 'invoiceTemplate');
    return result?.data || {};
  }

  /**
   * Update invoice template with automatic version history snapshot
   */
  async updateTemplate(tenantId, data, changedBy = null) {
    // Update via settings service (stores in Settings.invoiceTemplate JSON)
    const updated = await settingsPrismaService.updateCategorySettings(
      tenantId,
      'invoiceTemplate',
      data,
      changedBy,
    );

    // Create a version snapshot for audit trail
    const versionCount = await prisma.invoiceTemplateVersion.count({ where: { tenantId } });

    await prisma.invoiceTemplateVersion.create({
      data: {
        tenantId,
        versionNumber: versionCount + 1,
        templateConfig: updated.data || data,
        templateName: data.templateName || null,
        templateType: data.templateType || null,
        changeReason: data.changeReason || null,
        changedBy,
      },
    });

    // Emit event so billing/print systems can react
    await settingsEventEmitter.emit(SettingsEvents.INVOICE_TEMPLATE_UPDATED, {
      tenantId,
      data: updated.data,
    });

    return updated;
  }

  /**
   * Preview invoice template — returns sample rendered metadata
   */
  async previewTemplate(tenantId, config = null) {
    const templateConfig = config || (await this.getTemplate(tenantId));
    const prefix = templateConfig.invoicePrefix || 'INV';

    // Build sample invoice items
    const items = [
      { name: 'Dolo 650', hsnCode: '3004', qty: 2, rate: 20, gstPercentage: 18, amount: 40 },
      {
        name: 'Amoxicillin 500mg',
        hsnCode: '3004',
        qty: 1,
        rate: 45,
        gstPercentage: 12,
        amount: 45,
      },
    ];

    const subtotal = 85;
    const cgst = 5.7;
    const sgst = 5.7;
    const totalAmount = 96.4;

    const preview = {
      invoiceNumber: `${prefix}-2026-PREVIEW`,
      date: new Date().toISOString(),
      customerName: 'Sample Patient',
      doctorName: templateConfig.showDoctorName !== false ? 'Dr. Sample' : null,
      items,
      subtotal,
      cgst: templateConfig.showGSTBreakdown !== false ? cgst : null,
      sgst: templateConfig.showGSTBreakdown !== false ? sgst : null,
      gstAmount: cgst + sgst,
      totalAmount,
      totalInWords: 'Rupees Ninety Six and Forty Paise Only',
      qrPayload: templateConfig.showQRCode
        ? `${prefix}-2026-PREVIEW|${templateConfig.gstin || 'NA'}|${totalAmount}`
        : null,
      logoUrl: templateConfig.showLogo !== false ? templateConfig.logoUrl || null : null,
      footerText: templateConfig.footerText || 'Thank you for visiting',
    };

    return {
      success: true,
      data: {
        preview,
        config: {
          templateName: templateConfig.templateName || 'DEFAULT_GST_TEMPLATE',
          templateType: templateConfig.templateType || 'A4_GST',
          paperSize: templateConfig.paperSize || 'A4',
          showLogo: templateConfig.showLogo !== false,
          showDoctorName: templateConfig.showDoctorName !== false,
          showGSTBreakdown: templateConfig.showGSTBreakdown !== false,
          showHSNCode: templateConfig.showHSNCode !== false,
          showQRCode: !!templateConfig.showQRCode,
          showExpiryDate: !!templateConfig.showExpiryDate,
          showBatchNumber: !!templateConfig.showBatchNumber,
          invoicePrefix: prefix,
          footerText: templateConfig.footerText || '',
          logoUrl: templateConfig.logoUrl || '',
        },
      },
    };
  }

  /**
   * List version history for invoice templates
   */
  async getVersionHistory(tenantId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const [versions, total] = await Promise.all([
      prisma.invoiceTemplateVersion.findMany({
        where: { tenantId },
        orderBy: { versionNumber: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.invoiceTemplateVersion.count({ where: { tenantId } }),
    ]);

    return {
      success: true,
      data: { versions, total, limit, offset },
    };
  }

  /**
   * Restore a previous version of the invoice template
   */
  async restoreVersion(tenantId, versionId, changedBy = null) {
    const version = await prisma.invoiceTemplateVersion.findFirst({
      where: { id: versionId, tenantId },
    });

    if (!version) {
      throw new Error('Invoice template version not found');
    }

    // Restore the config from that version's snapshot
    const restoredConfig = version.templateConfig;

    // Add metadata about the restoration
    restoredConfig.changeReason = `Restored from version ${version.versionNumber}`;

    // Update template with the restored config (this will also create a new version)
    return this.updateTemplate(tenantId, restoredConfig, changedBy);
  }

  /**
   * Test render — validate template configuration for various outputs
   */
  async testRender(tenantId, config = null) {
    const templateConfig = config || (await this.getTemplate(tenantId));

    const warnings = [];
    const errors = [];

    // Validate GST compliance fields
    const requiredGstFields = ['gstin', 'invoicePrefix'];
    for (const field of requiredGstFields) {
      if (!templateConfig[field]) {
        warnings.push(`Missing recommended GST field: ${field}`);
      }
    }

    // Validate footer text length for thermal
    if (templateConfig.paperSize === 'THERMAL_80MM') {
      const maxThermalWidth = 42;
      if (templateConfig.footerText && templateConfig.footerText.length > maxThermalWidth) {
        warnings.push('Footer text exceeds 42-char thermal printer width — may cause overflow');
      }
      if (templateConfig.storeName && templateConfig.storeName.length > maxThermalWidth) {
        warnings.push('Store name exceeds 42-char thermal printer width');
      }
    }

    // Validate QR payload if enabled
    if (templateConfig.showQRCode) {
      if (!templateConfig.gstin) {
        warnings.push('QR code enabled but GSTIN is missing — QR verification will be incomplete');
      }
    }

    // Validate logo URL
    if (templateConfig.showLogo !== false && !templateConfig.logoUrl) {
      warnings.push('Logo display enabled but no logo URL configured');
    }

    return {
      success: true,
      data: {
        valid: errors.length === 0,
        errors,
        warnings,
        sampleRender: {
          pageSize: templateConfig.paperSize || 'A4',
          hasLogo: !!(templateConfig.showLogo !== false && templateConfig.logoUrl),
          showsGST: templateConfig.showGSTBreakdown !== false,
          showsHSN: templateConfig.showHSNCode !== false,
          showsQR: !!templateConfig.showQRCode,
          showsExpiry: !!templateConfig.showExpiryDate,
          showsBatch: !!templateConfig.showBatchNumber,
          showsDoctor: templateConfig.showDoctorName !== false,
          thermalSafe:
            templateConfig.paperSize === 'THERMAL_80MM'
              ? warnings.filter((w) => w.includes('thermal')).length === 0
              : true,
        },
      },
    };
  }

  /**
   * Generate QR payload for invoice
   */
  _generateQrPayload(invoiceNumber, gstin, totalAmount) {
    return `${invoiceNumber}|${gstin || 'NA'}|${totalAmount}`;
  }
}

export default new InvoiceTemplateService();
