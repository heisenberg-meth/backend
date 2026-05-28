import { jest , describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  invoiceTemplateVersion: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockSettingsPrismaService = {
  getSettingsWithCache: jest.fn(),
  updateCategorySettings: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../../src/modules/settings/service/settings.prisma.service.js', () => ({ default: mockSettingsPrismaService }));
jest.unstable_mockModule('../../../src/modules/settings/events/settings.events.js', () => ({ 
  settingsEventEmitter: mockEventEmitter,
  SettingsEvents: { INVOICE_TEMPLATE_UPDATED: 'settings:invoice_template:updated' }
}));

const { default: invoiceTemplateService } = await import('../../../src/modules/settings/invoice-template/invoice-template.service.js');

describe('InvoiceTemplateService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTemplate', () => {
    it('should return template from settings service', async () => {
      mockSettingsPrismaService.getSettingsWithCache.mockResolvedValue({ data: { templateName: 'Test' } });
      const result = await invoiceTemplateService.getTemplate(tenantId);
      expect(result).toEqual({ templateName: 'Test' });
      expect(mockSettingsPrismaService.getSettingsWithCache).toHaveBeenCalledWith(tenantId, 'invoiceTemplate');
    });

    it('should return empty object if no settings found', async () => {
      mockSettingsPrismaService.getSettingsWithCache.mockResolvedValue(null);
      const result = await invoiceTemplateService.getTemplate(tenantId);
      expect(result).toEqual({});
    });
  });

  describe('updateTemplate', () => {
    it('should update settings and create a version record', async () => {
      const data = { templateName: 'New Template', invoicePrefix: 'PH' };
      mockSettingsPrismaService.updateCategorySettings.mockResolvedValue({ data });
      mockPrisma.invoiceTemplateVersion.count.mockResolvedValue(5);

      const result = await invoiceTemplateService.updateTemplate(tenantId, data, userId);

      expect(mockSettingsPrismaService.updateCategorySettings).toHaveBeenCalledWith(tenantId, 'invoiceTemplate', data, userId);
      expect(mockPrisma.invoiceTemplateVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          versionNumber: 6,
          templateName: 'New Template',
        }),
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('settings:invoice_template:updated', { tenantId, data });
      expect(result.data).toEqual(data);
    });
  });

  describe('previewTemplate', () => {
    it('should generate a preview with sample data', async () => {
      const config = { invoicePrefix: 'TEST', showGSTBreakdown: true };
      const result = await invoiceTemplateService.previewTemplate(tenantId, config);

      expect(result.success).toBe(true);
      expect(result.data.preview.invoiceNumber).toContain('TEST');
      expect(result.data.preview.items.length).toBeGreaterThan(0);
      expect(result.data.config.invoicePrefix).toBe('TEST');
    });
  });

  describe('restoreVersion', () => {
    it('should restore config from a version ID', async () => {
      const versionId = 'v1';
      const templateConfig = { templateName: 'Old' };
      mockPrisma.invoiceTemplateVersion.findFirst.mockResolvedValue({ id: versionId, versionNumber: 1, templateConfig });
      
      // updateTemplate is called internally, we mock its dependency
      mockSettingsPrismaService.updateCategorySettings.mockResolvedValue({ data: templateConfig });
      mockPrisma.invoiceTemplateVersion.count.mockResolvedValue(10);

      const result = await invoiceTemplateService.restoreVersion(tenantId, versionId, userId);

      expect(mockPrisma.invoiceTemplateVersion.findFirst).toHaveBeenCalledWith({ where: { id: versionId, tenantId } });
      expect(mockSettingsPrismaService.updateCategorySettings).toHaveBeenCalled();
      expect(result.data.templateName).toBe('Old');
    });

    it('should throw error if version not found', async () => {
      mockPrisma.invoiceTemplateVersion.findFirst.mockResolvedValue(null);
      await expect(invoiceTemplateService.restoreVersion(tenantId, 'none', userId)).rejects.toThrow('Invoice template version not found');
    });
  });

  describe('testRender', () => {
    it('should return warnings for missing GSTIN', async () => {
      const config = { invoicePrefix: 'INV' };
      const result = await invoiceTemplateService.testRender(tenantId, config);
      expect(result.data.warnings).toContain('Missing recommended GST field: gstin');
    });

    it('should warn about thermal overflow', async () => {
      const config = { paperSize: 'THERMAL_80MM', footerText: 'A very long footer text that exceeds forty two characters for testing overflow' };
      const result = await invoiceTemplateService.testRender(tenantId, config);
      expect(result.data.warnings.some(w => w.includes('thermal printer width'))).toBe(true);
    });

    it('should validate QR configuration', async () => {
      const config = { showQRCode: true, gstin: null };
      const result = await invoiceTemplateService.testRender(tenantId, config);
      expect(result.data.warnings.some(w => w.includes('QR code enabled but GSTIN is missing'))).toBe(true);
    });
  });
});
