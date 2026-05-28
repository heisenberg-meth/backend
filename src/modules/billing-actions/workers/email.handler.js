import emailDeliveryService from '../services/email-delivery.service.js';
import pdfRenderer from '../services/pdf-renderer.service.js';
import deliveryAuditService from '../services/delivery-audit.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

export async function processEmailDelivery(data) {
  const { invoiceId, tenantId, recipient, deliveryLogId } = data;

  logger.info(`[Worker] Sending email to ${recipient} for invoice ${invoiceId}`);

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: {
        include: {
          medicine: true,
          batch: true,
        },
      },
      patient: true,
      tenant: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  try {
    const pdfBuffer = await pdfRenderer.renderA4(invoice, invoice.tenant);

    const result = await emailDeliveryService.sendInvoiceEmail(recipient, invoice, pdfBuffer, {
      tenantName: invoice.tenant.name,
      branding: {
        logoText: invoice.tenant.name,
        tagline: invoice.tenant.tagline,
      },
    });

    await deliveryAuditService.updateDeliveryStatus(deliveryLogId, 'SENT', {
      providerMessageId: result.messageId,
    });

    emitLocalEvent(EVENTS.INVOICE_EMAIL_SENT, {
      invoiceId,
      tenantId,
      recipient,
      messageId: result.messageId,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Worker] Email sent successfully: ${result.messageId}`);

    return result;
  } catch (err) {
    logger.error(`[Worker] Email delivery failed: ${err.message}`);

    await deliveryAuditService.updateDeliveryStatus(deliveryLogId, 'FAILED', {
      failureReason: err.message,
    });

    throw err;
  }
}
