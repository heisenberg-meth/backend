import whatsappService from '../services/whatsapp.service.js';
import deliveryAuditService from '../services/delivery-audit.service.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

export async function processWhatsappDelivery(data) {
  const { invoiceId, tenantId, recipient, deliveryLogId } = data;

  logger.info(`[Worker] Sending WhatsApp to ${recipient} for invoice ${invoiceId}`);

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      invoiceNumber: true,
      totalAmount: true,
      paymentStatus: true,
    },
  });

  if (!invoice) {
    throw new Error(`Invoice not found: ${invoiceId}`);
  }

  try {
    const result = await whatsappService.sendInvoice(recipient, invoice);

    await deliveryAuditService.updateDeliveryStatus(deliveryLogId, 'SENT', {
      providerMessageId: result.messageId,
    });

    emitLocalEvent(EVENTS.INVOICE_WHATSAPP_SENT, {
      invoiceId,
      tenantId,
      recipient,
      messageId: result.messageId,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[Worker] WhatsApp sent successfully: ${result.messageId}`);

    return result;
  } catch (err) {
    logger.error(`[Worker] WhatsApp delivery failed: ${err.message}`);

    await deliveryAuditService.updateDeliveryStatus(deliveryLogId, 'FAILED', {
      failureReason: err.message,
    });

    throw err;
  }
}
