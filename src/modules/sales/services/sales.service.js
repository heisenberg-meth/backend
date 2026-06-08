import salesRepository from '../repositories/sales.repository.js';
import prisma from '../../../config/prisma.js';
import scheduleService from '../../compliance/services/schedule.service.js';
import anomalyService from '../../fraud-detection/services/anomaly.service.js';
import { normalizeInvoice } from '../../billing/helpers/invoice-dto.js';

class SalesService {
  async recordSale(tenantId, data, tx) {
    const client = tx || prisma;

    for (const item of data.items) {
      const validation = await scheduleService.canDispense(item.medicineId, null, data.userId);
      if (!validation.allowed) {
        throw new Error(`Compliance Violation: ${validation.reason}`);
      }
    }

    let sale = null;
    if (data.invoiceId) {
      sale = await client.sale.findUnique({
        where: { invoiceId: data.invoiceId },
        include: {
          items: {
            include: {
              medicine: true,
              batch: true,
            },
          },
          invoice: true,
          patient: true,
        },
      });
    }

    if (!sale) {
      sale = await salesRepository.createSale(
        {
          tenantId,
          invoiceId: data.invoiceId,
          branchId: data.branchId,
          patientId: data.patientId,
          totalItems: data.totalItems,
          subtotal: data.subtotal,
          discountAmount: data.discountAmount,
          gstAmount: data.gstAmount,
          totalAmount: data.totalAmount,
          paymentMethod: data.paymentMethod,
          paymentStatus: 'PAID',
          status: 'COMPLETED',
          soldBy: data.userId,
          items: data.items,
        },
        client,
      );
    }

    await anomalyService.detectSalesAnomaly(tenantId, sale);

    return normalizeInvoice(sale);
  }

  async getSalesHistory(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [sales, total] = await Promise.all([
      salesRepository.findAll(tenantId, skip, limit),
      salesRepository.countAll(tenantId),
    ]);

    return {
      sales: sales.map(normalizeInvoice),
      total,
      page,
      limit,
    };
  }

  async getSaleById(id, tenantId) {
    const sale = await salesRepository.findById(id, tenantId);
    if (!sale) throw new Error('Sale record not found');
    return normalizeInvoice(sale);
  }
}

export default new SalesService();
