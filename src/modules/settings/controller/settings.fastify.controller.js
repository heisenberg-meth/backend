import settingsService from '../service/settings.prisma.service.js';
import invoiceTemplateService from '../invoice-template/invoice-template.service.js';
import gstService from '../gst/gst.service.js';

class SettingsFastifyController {
  async getSettings(request, reply) {
    const settings = await settingsService.getSettings(request.tenantId);
    return reply.send(settings);
  }

  async updateSettings(request, reply) {
    const settings = await settingsService.updateSettings(request.tenantId, request.body);
    return reply.send(settings);
  }

  // ── Invoice Template ────────────────────────────────────────

  async getInvoiceTemplate(request, reply) {
    const result = await invoiceTemplateService.getTemplate(request.tenantId);
    return reply.send({ success: true, data: result });
  }

  async updateInvoiceTemplate(request, reply) {
    const data = request.body.data || request.body;
    const result = await invoiceTemplateService.updateTemplate(request.tenantId, data, request.user?.id || request.tenantId);
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
    const result = await invoiceTemplateService.restoreVersion(request.tenantId, versionId, request.user?.id || request.tenantId);
    return reply.send(result);
  }

  async testRenderInvoiceTemplate(request, reply) {
    const data = request.body.data || request.body;
    const result = await invoiceTemplateService.testRender(request.tenantId, data);
    return reply.send(result);
  }

  // ── GST Settings ────────────────────────────────────────────

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
      request.ip
    );
    return reply.send({ success: true, data: updated });
  }

  async getGstVersionHistory(request, reply) {
    const { category } = request.params;
    const branchId = request.query.branchId || null;
    const history = await gstService.getGstVersionHistory(
      request.tenantId,
      category,
      branchId
    );
    return reply.send({ success: true, data: history });
  }
}

export default new SettingsFastifyController();
