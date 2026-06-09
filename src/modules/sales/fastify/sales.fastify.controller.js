import prisma from '../../../config/prisma.js';
import salesService from '../services/sales.service.js';
import analyticsService from '../services/analytics.service.js';
import refundService from '../../refunds/services/refund-orchestration.service.js';
import { success } from '../../../shared/helpers/response.js';

class SalesFastifyController {
  async getSalesHistory(request, reply) {
    const { page, limit, startDate, endDate } = request.query;
    const history = await salesService.getSalesHistory(
      request.tenantId,
      parseInt(page) || 1,
      parseInt(limit) || 20,
      startDate,
      endDate,
    );
    return reply.send(success(history));
  }

  async getSaleById(request, reply) {
    const sale = await salesService.getSaleById(request.params.id, request.tenantId);
    return reply.send(success(sale));
  }

  async getTrends(request, reply) {
    const { days } = request.query;
    const trends = await analyticsService.getTrends(request.tenantId, parseInt(days) || 7);
    return reply.send(success(trends));
  }

  async triggerManualSummary(request, reply) {
    const { date } = request.body;
    const summary = await analyticsService.generateDailySummary(
      request.tenantId,
      date || new Date(),
    );
    return reply.send(success(summary));
  }

  async createSale(request, reply) {
    const data = {
      ...request.body,
      userId: request.user.id,
      tenantId: request.tenantId,
    };
    const sale = await salesService.recordSale(request.tenantId, data);
    return reply.code(201).send(success(sale));
  }

  async deleteSale(request, reply) {
    const { id } = request.params;
    await salesService.getSaleById(id, request.tenantId);
    await prisma.sale.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: request.user.id },
    });
    return reply.send(success({ message: 'Sale cancelled successfully' }));
  }

  async refundSale(request, reply) {
    const { id } = request.params;
    const sale = await salesService.getSaleById(id, request.tenantId);
    const refundData = {
      invoiceId: sale.invoiceId,
      items: request.body.items || [],
      reason: request.body.reason || 'Customer Request',
      refundAmount: request.body.refundAmount || 0,
      branchId: request.branchId || sale.branchId || null,
    };
    const result = await refundService.createRefund(request.tenantId, refundData, request.user.id);
    return reply.send(success(result));
  }
}

export default new SalesFastifyController();
