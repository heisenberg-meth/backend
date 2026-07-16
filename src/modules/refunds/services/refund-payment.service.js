import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class RefundPaymentService {
  async createRefundPayment(tenantId, returnId, invoiceId, payments, tx) {
    const client = tx || prisma;
    const created = [];

    for (const payment of payments) {
      const refundPayment = await client.refundPayment.create({
        data: {
          tenantId,
          returnId,
          invoiceId,
          paymentMode: payment.paymentMode,
          amount: payment.amount,
          transactionReference: payment.transactionReference || null,
          refundStatus: 'COMPLETED',
        },
      });
      created.push(refundPayment);
    }

    if (payments.length > 0) {
      await this.updateInvoicePaymentState(invoiceId, returnId, payments, client);
    }

    logger.info(
      `[Refund Payment] Created ${created.length} refund payments for return ${returnId}`,
    );
    return created;
  }

  async updateInvoicePaymentState(invoiceId, returnId, refundPayments, client) {
    const invoice = await client.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });

    if (!invoice) return;

    const totalRefunded = refundPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalPaid = Number(invoice.paidAmount);
    const newPaid = Number(Math.max(0, totalPaid - totalRefunded).toFixed(2));

    const newPaymentStatus = newPaid <= 0 ? 'REFUNDED' : 'PARTIAL';
    const newStatus = newPaid <= 0 ? 'REFUNDED' : invoice.status;

    await client.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaid,
        paymentStatus: newPaymentStatus,
        status: newStatus,
      },
    });
  }

  async getRefundPayments(returnId) {
    return prisma.refundPayment.findMany({
      where: { returnId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export default new RefundPaymentService();
