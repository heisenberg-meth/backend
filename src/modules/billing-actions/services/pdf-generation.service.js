import prisma from '../../../config/prisma.js';
import pdfRenderer from './pdf-renderer.service.js';
import s3Storage from './s3-storage.service.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

import invoiceTemplateService from '../../settings/invoice-template/invoice-template.service.js';

class PdfGenerationService {
  async generateAndStore(invoiceId, tenantId, options = {}) {
    const { watermark, duplicateCopy } = options;

    const [invoice, templateConfig] = await Promise.all([
      prisma.invoice.findUnique({
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
      }),
      invoiceTemplateService.getTemplate(tenantId),
    ]);

    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    if (invoice.status === 'CANCELLED' && !watermark) {
      throw new Error('Cannot generate PDF for cancelled invoice without watermark');
    }

    const tenant = invoice.tenant;
    const renderOptions = {
      watermark: invoice.status === 'CANCELLED' ? 'CANCELLED INVOICE' : watermark,
      duplicateCopy,
      templateConfig
    };

    // Choose renderer based on template type if needed
    const pdfBuffer = await pdfRenderer.renderA4(invoice, tenant, renderOptions);

    const pdfKey = s3Storage.generatePDFKey(tenantId, invoiceId, watermark);
    const uploadResult = await s3Storage.uploadPDF(pdfBuffer, pdfKey);

    let signedUrl = null;
    if (uploadResult.key) {
      signedUrl = await s3Storage.getSignedUrl(uploadResult.key, 3600);
    }

    const deliveryLog = await prisma.invoiceDeliveryLog.create({
      data: {
        tenantId,
        invoiceId,
        deliveryChannel: 'PDF',
        recipient: 'system',
        deliveryStatus: 'DELIVERED',
        pdfUrl: signedUrl,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        triggeredBy: options.triggeredBy,
      },
    });

    emitLocalEvent(EVENTS.INVOICE_PDF_GENERATED, {
      invoiceId,
      tenantId,
      deliveryLogId: deliveryLog.id,
      pdfUrl: signedUrl,
      timestamp: new Date().toISOString(),
    });

    logger.info(`[PDF] Generated and stored PDF for invoice ${invoiceId}`);

    return {
      pdfUrl: signedUrl,
      pdfKey: uploadResult.key,
      deliveryLogId: deliveryLog.id,
      expiresAt: deliveryLog.expiresAt,
    };
  }

  async regenerateWithWatermark(invoiceId, tenantId, options = {}) {
    const watermark = typeof options === 'string' ? options : options.watermark;
    return this.generateAndStore(invoiceId, tenantId, {
      watermark,
      triggeredBy: options.triggeredBy,
      duplicateCopy: options.duplicateCopy,
    });
  }

  async getSignedUrl(pdfKey, expiresIn = 3600) {
    return s3Storage.getSignedUrl(pdfKey, expiresIn);
  }
}

export default new PdfGenerationService();
