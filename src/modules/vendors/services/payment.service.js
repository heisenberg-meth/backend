import paymentRepository from '../repositories/payment.repository.js';
import supplierLedgerService from './ledger.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SupplierPaymentService {
  async recordPayment(tenantId, data, userId) {
    const payment = await paymentRepository.createPayment({
      tenantId,
      supplierId: data.supplierId,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate || new Date(),
      reference: data.reference,
      notes: data.notes,
      createdBy: userId,
    });

    await supplierLedgerService.recordEntry(tenantId, {
      supplierId: data.supplierId,
      type: 'PAYMENT',
      creditAmount: data.amount,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
    }, prisma);

    logger.info(`[Payment] Recorded payment ${payment.id} for supplier ${data.supplierId}: ${data.amount}`);
    return payment;
  }
}

export default new SupplierPaymentService();
