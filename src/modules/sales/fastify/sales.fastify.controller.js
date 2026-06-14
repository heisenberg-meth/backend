import prisma from '../../../config/prisma.js';
import salesService from '../services/sales.service.js';
import analyticsService from '../services/analytics.service.js';
import refundService from '../../refunds/services/refund-orchestration.service.js';
import { success } from '../../../shared/helpers/response.js';

class SalesFastifyController {
  async getSalesHistory(request, reply) {
    try {
      const { page, limit, startDate, endDate } = request.query;
      const history = await salesService.getSalesHistory(
        request.tenantId,
        parseInt(page) || 1,
        parseInt(limit) || 20,
        startDate,
        endDate,
      );
      return reply.send(success(history));
    } catch (error) {
      request.log.error({ err: error, endpoint: 'sales-history' }, 'Sales error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSaleById(request, reply) {
    try {
      const sale = await salesService.getSaleById(request.params.id, request.tenantId);
      return reply.send(success(sale));
    } catch (error) {
      request.log.error({ err: error, endpoint: 'sales-by-id' }, 'Sales error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getTrends(request, reply) {
    try {
      const { days } = request.query;
      const trends = await analyticsService.getTrends(request.tenantId, parseInt(days) || 7);
      return reply.send(success(trends));
    } catch (error) {
      request.log.error({ err: error, endpoint: 'sales-trends' }, 'Sales error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async triggerManualSummary(request, reply) {
    try {
      const { date } = request.body;
      const summary = await analyticsService.generateDailySummary(
        request.tenantId,
        date || new Date(),
      );
      return reply.send(success(summary));
    } catch (error) {
      request.log.error({ err: error, endpoint: 'sales-trigger-summary' }, 'Sales error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async createSale(request, reply) {
    try {
      const data = {
        ...request.body,
        userId: request.user.id,
        tenantId: request.tenantId,
      };
      const sale = await salesService.recordSale(request.tenantId, data);
      return reply.code(201).send(success(sale));
    } catch (error) {
      request.log.error({ err: error, endpoint: 'sales-create' }, 'Sales error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async deleteSale(request, reply) {
    try {
      const { id } = request.params;
      await salesService.getSaleById(id, request.tenantId);
      await prisma.sale.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: request.user.id },
      });
      return reply.send(success({ message: 'Sale cancelled successfully' }));
    } catch (error) {
      request.log.error({ err: error, endpoint: 'sales-delete' }, 'Sales error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async refundSale(request, reply) {
    try {
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
    } catch (error) {
      request.log.error({ err: error, endpoint: 'sales-refund' }, 'Sales error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new SalesFastifyController();
