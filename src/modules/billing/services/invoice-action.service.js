import prisma from '../../../config/prisma.js';
import billingQueueService from '../queues/billing.queue.js';
import pdfService from './pdf.service.js';
import invoiceEngine from '../invoice-engine/invoice.engine.js';

class InvoiceActionService {
  async finalize(invoiceId, tenantId, userId) {
    const invoice = await invoiceEngine.finalize(invoiceId, tenantId, userId);

    await billingQueueService.queuePdfGeneration(invoiceId, tenantId);

    return invoice;
  }

  async generatePdf(invoiceId, tenantId) {
    return await pdfService.generateInvoicePdf(invoiceId, tenantId);
  }

  async share(invoiceId, tenantId, options) {
    const { channel, recipient } = options;
    await billingQueueService.queueSharing(invoiceId, tenantId, { channel, recipient });

    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: 'SHARED',
        metadata: { channel, recipient },
      },
    });

    return { message: `Sharing queued via ${channel}` };
  }

  async cancel(invoiceId, tenantId, userId, reason) {
    const invoice = await invoiceEngine.cancel(invoiceId, tenantId, userId, reason);

    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: 'INVOICE_CANCELLED',
        metadata: { reason, userId },
      },
    });

    return invoice;
  }

  /**
   * Get full lifecycle timeline
   */
  async getTimeline(invoiceId, tenantId) {
    return await prisma.invoiceEvent.findMany({
      where: { invoiceId, invoice: { tenantId } },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export default new InvoiceActionService();
