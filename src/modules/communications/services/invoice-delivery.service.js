import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import communicationQueue from '../queues/communication.queue.js';
import templateSelectorService from './template-selector.service.js';

class InvoiceDeliveryService {
  async sendInvoice(patientId, invoiceId, tenantId, preferredChannel) {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        allowSms: true,
        allowWhatsapp: true,
        allowEmail: true,
      },
    });
    if (!patient) throw new Error('Patient not found');

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, prescription: true },
    });
    if (!invoice) throw new Error('Invoice not found');

    const channel = templateSelectorService.selectBestChannel(
      patient,
      'INVOICE_DELIVERY',
      preferredChannel,
    );
    if (!channel) throw new Error('No suitable communication channel for invoice delivery');

    const notification = await prisma.notification.create({
      data: {
        tenantId,
        patientId,
        channel,
        notificationType: 'INVOICE',
        recipient: channel === 'EMAIL' ? patient.email : patient.phone,
        subject: 'INVOICE_DELIVERY',
        message: '',
        deliveryStatus: 'QUEUED',
      },
    });

    await prisma.notificationDeliveryEvent.create({
      data: { notificationId: notification.id, eventType: 'QUEUED', eventTimestamp: new Date() },
    });

    const fallbackChain = templateSelectorService.buildFallbackChain(
      patient,
      'INVOICE_DELIVERY',
      channel,
    );

    await communicationQueue.add('send-invoice', {
      notificationId: notification.id,
      tenantId,
      patientId: patient.id,
      patientName: patient.fullName,
      patientEmail: patient.email,
      recipient: channel === 'EMAIL' ? patient.email : patient.phone,
      channel,
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
      fallbackChain,
    });

    logger.info({ notificationId: notification.id, channel, invoiceId }, 'Invoice delivery queued');
    return { success: true, notificationId: notification.id, channel };
  }

  async getSignedInvoiceUrl(invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoiceNumber: true, invoicePdf: true },
    });
    if (!invoice) throw new Error('Invoice not found');

    if (invoice.invoicePdf) {
      const expiry = Date.now() + 15 * 60 * 1000;
      return `${invoice.invoicePdf}?signature=inv_sig_${invoice.id}&expires=${expiry}`;
    }

    return `/api/billing/invoice/${invoiceId}/pdf?token=signed`;
  }
}

export default new InvoiceDeliveryService();
