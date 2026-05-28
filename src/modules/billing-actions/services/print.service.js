import prisma from '../../../config/prisma.js';
import pdfRenderer from './pdf-renderer.service.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { EVENTS } from '../../../shared/constants/events.js';

const PRINTER_TYPES = {
  THERMAL_58MM: 'THERMAL_58MM',
  THERMAL_80MM: 'THERMAL_80MM',
  A4: 'A4',
  BARCODE: 'BARCODE',
  QR: 'QR',
};

const PRINT_STATUSES = {
  PENDING: 'PENDING',
  PRINTED: 'PRINTED',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING',
};

class PrintService {
  async createPrintJob(invoiceId, tenantId, options = {}) {
    const { printerType = 'A4', copies = 1, printerEndpoint } = options;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
        tenant: true,
      },
    });

    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    const printJob = await prisma.invoicePrintJob.create({
      data: {
        tenantId,
        invoiceId,
        printerType,
        copies,
        printStatus: PRINT_STATUSES.PENDING,
        printerEndpoint,
        createdBy: options.triggeredBy,
      },
    });

    logger.info(`[Print] Created print job ${printJob.id} for invoice ${invoiceId}`);

    return printJob;
  }

  async renderPrintPayload(invoice, printerType) {
    const tenant = invoice.tenant;

    const invoiceTemplate = await prisma.invoiceTemplate.findUnique({
      where: { tenantId: tenant.id },
    });
    const templateConfig = invoiceTemplate?.config || {};

    if (printerType === PRINTER_TYPES.THERMAL_58MM) {
      return pdfRenderer.renderThermal(invoice, tenant, { width: 58, templateConfig });
    }

    if (printerType === PRINTER_TYPES.THERMAL_80MM) {
      return pdfRenderer.renderThermal(invoice, tenant, { width: 80, templateConfig });
    }

    return pdfRenderer.renderA4(invoice, tenant, { templateConfig });
  }

  async processPrintJob(printJobId) {
    const printJob = await prisma.invoicePrintJob.findUnique({
      where: { id: printJobId },
      include: {
        invoice: {
          include: {
            items: {
              include: {
                medicine: true,
                batch: true,
              },
            },
            tenant: true,
          },
        },
      },
    });

    if (!printJob) {
      throw new Error(`Print job not found: ${printJobId}`);
    }

    if (printJob.printStatus === PRINT_STATUSES.PRINTED) {
      return { status: 'already_printed', printJob };
    }

    await prisma.invoicePrintJob.update({
      where: { id: printJobId },
      data: { printStatus: PRINT_STATUSES.RETRYING },
    });

    try {
      const printBuffer = await this.renderPrintPayload(printJob.invoice, printJob.printerType);

      if (printJob.printerEndpoint) {
        await this.sendToPrinter(printJob.printerEndpoint, printBuffer, printJob.copies);
      }

      await prisma.invoicePrintJob.update({
        where: { id: printJobId },
        data: {
          printStatus: PRINT_STATUSES.PRINTED,
          updatedAt: new Date(),
        },
      });

      emitLocalEvent(EVENTS.INVOICE_PRINTED, {
        invoiceId: printJob.invoiceId,
        printJobId,
        printerType: printJob.printerType,
        timestamp: new Date().toISOString(),
      });

      logger.info(`[Print] Job ${printJobId} completed successfully`);

      return { status: 'printed', printJob };
    } catch (err) {
      const retryCount = printJob.retryCount + 1;

      await prisma.invoicePrintJob.update({
        where: { id: printJobId },
        data: {
          printStatus: retryCount >= 3 ? PRINT_STATUSES.FAILED : PRINT_STATUSES.PENDING,
          retryCount,
          failureReason: err.message,
        },
      });

      logger.error(`[Print] Job ${printJobId} failed (attempt ${retryCount}): ${err.message}`);

      return { status: 'failed', error: err.message, retryCount };
    }
  }

  async sendToPrinter(endpoint, buffer, copies) {
    logger.info(`[Print] Sending to printer at ${endpoint}, copies: ${copies}`);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: buffer,
      });

      if (!response.ok) {
        throw new Error(`Printer returned ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (err) {
      throw new Error(`Printer communication failed: ${err.message}`);
    }
  }

  async getPrintJobsForInvoice(invoiceId) {
    return prisma.invoicePrintJob.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingPrintJobs(limit = 50) {
    return prisma.invoicePrintJob.findMany({
      where: { printStatus: PRINT_STATUSES.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}

export { PRINTER_TYPES, PRINT_STATUSES };
export default new PrintService();
