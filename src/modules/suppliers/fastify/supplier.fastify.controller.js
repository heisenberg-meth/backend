import supplierService from '../services/supplier.service.js';
import { toSupplierListDto, toSupplierDetailDto } from '../dto/supplier-response.dto.js';

class SupplierFastifyController {
  async createSupplier(request, reply) {
    const supplier = await supplierService.createSupplier(request.body, request.tenantId, request.user.id);
    return reply.code(201).send({ success: true, data: toSupplierDetailDto(supplier) });
  }

  async getSuppliers(request, reply) {
    const result = await supplierService.getSuppliers(request.tenantId, request.query);
    return reply.send({
      success: true,
      data: result.suppliers.map(toSupplierListDto),
      pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
    });
  }

  async getStats(request, reply) {
    const stats = await supplierService.getStats(request.tenantId);
    return reply.send({ success: true, data: stats });
  }

  async getSupplierById(request, reply) {
    const supplier = await supplierService.getSupplierById(request.params.id, request.tenantId);
    return reply.send({ success: true, data: toSupplierDetailDto(supplier) });
  }

  async updateSupplier(request, reply) {
    const supplier = await supplierService.updateSupplier(request.params.id, request.tenantId, request.body, request.user.id);
    return reply.send({ success: true, data: toSupplierDetailDto(supplier) });
  }

  async deleteSupplier(request, reply) {
    await supplierService.deleteSupplier(request.params.id, request.tenantId, request.user.id);
    return reply.send({ success: true, message: 'Supplier archived successfully' });
  }

  async getPerformance(request, reply) {
    const performance = await supplierService.getPerformance(request.params.id, request.tenantId);
    return reply.send({ success: true, data: performance });
  }

  async getPurchaseHistory(request, reply) {
    const result = await supplierService.getPurchaseHistory(request.params.id, request.tenantId, request.query);
    return reply.send({ success: true, data: result.orders, pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
  }

  async getPendingPayments(request, reply) {
    const payments = await supplierService.getPendingPayments(request.params.id, request.tenantId);
    return reply.send({ success: true, data: payments });
  }

  async getDrugs(request, reply) {
    const drugs = await supplierService.getDrugs(request.params.id, request.tenantId);
    return reply.send({ success: true, data: drugs });
  }

  async getDeliveryHistory(request, reply) {
    const history = await supplierService.getDeliveryHistory(request.params.id, request.tenantId);
    return reply.send({ success: true, data: history });
  }

  async getSpendAnalysis(request, reply) {
    const analysis = await supplierService.getSpendAnalysis(request.params.id, request.tenantId);
    return reply.send({ success: true, data: analysis });
  }

  async getRiskAlerts(request, reply) {
    const alerts = await supplierService.getRiskAlerts(request.params.id, request.tenantId);
    return reply.send({ success: true, data: alerts });
  }

  async getReconciliation(request, reply) {
    const data = await supplierService.getReconciliation(request.params.id, request.tenantId);
    return reply.send({ success: true, data });
  }

  async getLedger(request, reply) {
    const result = await supplierService.getLedger(request.params.id, request.tenantId, request.query);
    return reply.send({ success: true, data: result.entries, pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages } });
  }

  async recordPayment(request, reply) {
    const payment = await supplierService.recordPayment(request.params.id, request.tenantId, request.user.id, request.body);
    return reply.code(201).send({ success: true, data: payment });
  }

  async compareSuppliers(request, reply) {
    const { ids } = request.query;
    if (!ids) throw new Error('Supplier IDs are required for comparison');
    const data = await supplierService.compareSuppliers(ids, request.tenantId);
    return reply.send({ success: true, data });
  }

  async getRankings(request, reply) {
    const data = await supplierService.getRankings(request.tenantId);
    return reply.send({ success: true, data });
  }
}

export default new SupplierFastifyController();
