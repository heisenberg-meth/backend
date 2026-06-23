import settingsService from '../service/settings.prisma.service.js';
import invoiceTemplateService from '../invoice-template/invoice-template.service.js';
import gstService from '../gst/gst.service.js';
import MediaService from '../../../shared/services/media.service.js';

class SettingsFastifyController {
  async getSettings(request, reply) {
    const settings = await settingsService.getSettings(request.tenantId);
    if (settings?.invoiceTemplate?.logoUrl) {
      settings.invoiceTemplate.logoUrl = MediaService.enforceHttps(settings.invoiceTemplate.logoUrl);
    }
    if (settings?.storeProfile?.logoUrl) {
      settings.storeProfile.logoUrl = MediaService.enforceHttps(settings.storeProfile.logoUrl);
    }
    if (settings?.storeProfile?.invoiceLogoUrl) {
      settings.storeProfile.invoiceLogoUrl = MediaService.enforceHttps(settings.storeProfile.invoiceLogoUrl);
    }
    if (settings?.storeProfile?.whatsappLogoUrl) {
      settings.storeProfile.whatsappLogoUrl = MediaService.enforceHttps(settings.storeProfile.whatsappLogoUrl);
    }
    return reply.send(settings);
  }

  async updateSettings(request, reply) {
    const settings = await settingsService.updateSettings(request.tenantId, request.body);
    return reply.send(settings);
  }

  async updateCategorySettings(request, reply) {
    const rawCategory = request.url.split('?')[0].split('/').pop();
    const categoryMap = {
      'store-profile': 'storeProfile',
      'invoice-template': 'invoiceTemplate',
    };
    const category = categoryMap[rawCategory] || rawCategory;
    const settings = await settingsService.updateCategorySettings(
      request.tenantId,
      category,
      request.body,
      request.user?.id || request.tenantId,
      request.ip,
    );
    return reply.send(settings);
  }

  async getInvoiceTemplate(request, reply) {
    const result = await invoiceTemplateService.getTemplate(request.tenantId);
    if (result?.logoUrl) {
      result.logoUrl = MediaService.enforceHttps(result.logoUrl);
    }
    return reply.send({ success: true, data: result });
  }

  async updateInvoiceTemplate(request, reply) {
    const data = request.body.data || request.body;
    if (data.logoUrl) {
      data.logoUrl = MediaService.enforceHttps(data.logoUrl);
    }
    const result = await invoiceTemplateService.updateTemplate(
      request.tenantId,
      data,
      request.user?.id || request.tenantId,
    );
    return reply.send({ success: true, data: result });
  }

  async previewInvoiceTemplate(request, reply) {
    const data = request.body.data || request.body;
    const result = await invoiceTemplateService.previewTemplate(request.tenantId, data);
    return reply.send(result);
  }

  async getInvoiceTemplateVersions(request, reply) {
    const { limit, offset } = request.query;
    const result = await invoiceTemplateService.getVersionHistory(request.tenantId, {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
    });
    return reply.send(result);
  }

  async restoreInvoiceTemplateVersion(request, reply) {
    const { versionId } = request.params;
    if (!versionId) {
      return reply.code(400).send({ success: false, message: 'Version ID required' });
    }
    const result = await invoiceTemplateService.restoreVersion(
      request.tenantId,
      versionId,
      request.user?.id || request.tenantId,
    );
    return reply.send(result);
  }

  async testRenderInvoiceTemplate(request, reply) {
    const data = request.body.data || request.body;
    const result = await invoiceTemplateService.testRender(request.tenantId, data);
    return reply.send(result);
  }

  async getGstSettings(request, reply) {
    const branchId = request.query.branchId || null;
    const gstSettings = await gstService.getGstSettings(request.tenantId, branchId);
    return reply.send({ success: true, data: gstSettings });
  }

  async updateGstSettings(request, reply) {
    const data = request.body.data || request.body;
    const updated = await gstService.updateGstSettings(
      request.tenantId,
      data,
      request.tenantId,
      request.ip,
    );
    return reply.send({ success: true, data: updated });
  }

  async getGstVersionHistory(request, reply) {
    const { category } = request.params;
    const branchId = request.query.branchId || null;
    const history = await gstService.getGstVersionHistory(request.tenantId, category, branchId);
    return reply.send({ success: true, data: history });
  }
}

export default new SettingsFastifyController();
