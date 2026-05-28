import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import pdfService from '../services/pdf.service.js';
import notificationService from '../../notifications/services/notification.service.js';
import logger from '../../../shared/utils/logger.js';

const connection = getBullRedis();

// --- PDF WORKER ---
export const pdfWorker = new Worker('billing_pdf_generation', async (job) => {
  const { invoiceId, tenantId } = job.data;
  logger.info({ invoiceId }, 'Processing PDF generation job');
  await pdfService.generateInvoicePdf(invoiceId, tenantId);
}, { connection });

// --- SHARING WORKER ---
export const shareWorker = new Worker('billing_invoice_sharing', async (job) => {
  const { invoiceId, tenantId, channel, recipient } = job.data;
  logger.info({ invoiceId, channel }, 'Processing sharing job');
  
  // 1. Ensure PDF is generated
  let pdfUrl = await pdfService.generateInvoicePdf(invoiceId, tenantId);
  
  // 2. Send via notification system
  await notificationService.queueNotification({
    tenantId,
    channel,
    recipient,
    message: `Your invoice is ready. View it here: ${process.env.FRONTEND_URL}${pdfUrl}`,
    notificationType: 'INVOICE_SHARE',
  });

  logger.info({ invoiceId, channel }, 'Invoice share queued via notification system');
}, { connection });
