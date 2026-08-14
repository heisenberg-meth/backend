import repo from '../repositories/import.repository.js';
import ocrService from '../ocr/ocr.service.js';
import invoiceParser from '../parsing/invoice.parser.js';
import gstValidator from '../gst-validation/gst.validator.js';
import prisma from '../../../config/prisma.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';
import { mainQueue } from '../../../queue/index.js';
import logger from '../../../shared/utils/logger.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';

class ImportService {
  async createImportJob(data, tenantId, userId) {
    const job = await repo.createJob({
      tenantId,
      uploadedBy: userId,
      importType: data.type || 'PDF_INVOICE',
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      purchaseOrderId: data.purchaseOrderId || null,
      extractedData: data.extractedData || null,
      importStatus: 'UPLOADED',
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'IMPORT_JOB_CREATED',
      target: job.id,
      type: 'INVENTORY',
    });

    // Trigger async processing via queue
    await mainQueue.add('process-import-job', {
      jobId: job.id,
      tenantId,
      userId,
    });

    return job;
  }

  async processImportJob(jobId, tenantId) {
    const job = await repo.getJobById(jobId, tenantId);
    if (!job) throw new Error('Import job not found');

    await repo.updateJob(jobId, tenantId, { importStatus: 'PROCESSING' });
    await emitEvent(DOMAIN_EVENTS.IMPORT_STARTED, { jobId, tenantId, type: job.importType });

    try {
      let rawExtractedData = job.extractedData;
      let confidenceScore = 1.0;

      if (job.importType === 'PDF_INVOICE' && job.fileUrl) {
        const ocrResult = await ocrService.extractInvoiceData(job.fileUrl);
        rawExtractedData = ocrResult.data;
        confidenceScore = ocrResult.confidence || 0.9;

        await emitEvent(DOMAIN_EVENTS.OCR_COMPLETED, { jobId, tenantId });
      }

      // 1. Standardize Parsing
      const extractedData = invoiceParser.parse(rawExtractedData);

      // 2. GST Validation (Formula Check)
      const isGstValid = gstValidator.validateInvoiceTotals(extractedData);
      if (!isGstValid) {
        logger.warn({ jobId, extractedData }, 'GST Validation failed for import');
        // We don't fail the job, but we'll mark it for review
      }

      // 3. Duplicate Invoice Detection
      if (extractedData.invoiceNumber) {
        const existing = await prisma.importJob.findFirst({
          where: {
            tenantId,
            extractedData: { path: ['invoiceNumber'], equals: extractedData.invoiceNumber },
            importStatus: 'COMPLETED',
            id: { not: jobId },
          },
        });
        if (existing) throw new Error(`Invoice ${extractedData.invoiceNumber} already imported`);
      }

      // 4. Attempt PO Matching
      if (extractedData.orderNumber && !job.purchaseOrderId) {
        const po = await prisma.purchaseOrder.findFirst({
          where: { orderNumber: extractedData.orderNumber, tenantId, deletedAt: null },
        });
        if (po) {
          await repo.updateJob(jobId, tenantId, { purchaseOrderId: po.id });
        }
      }

      await repo.updateJob(jobId, tenantId, { extractedData });

      // 5. Process Items and Match Medicines
      let allMatched = true;
      if (extractedData.medicines) {
        for (const med of extractedData.medicines) {
          const matchedMed = await repo.findMedicineFuzzy(tenantId, med.name);
          if (!matchedMed) allMatched = false;
          const validationErrors = [];

          if (!isGstValid) validationErrors.push('Invoice GST totals do not match');

          // Expiry Validation
          if (med.expiryDate && new Date(med.expiryDate) < new Date()) {
            validationErrors.push('Medicine already expired');
          }

          // Batch Validation
          if (matchedMed && med.batchNumber) {
            const existingBatch = await prisma.inventoryBatch.findFirst({
              where: {
                medicineId: matchedMed.id,
                batchNumber: med.batchNumber,
                tenantId,
                deletedAt: null,
              },
            });
            if (existingBatch) {
              validationErrors.push(`Batch ${med.batchNumber} already exists for this medicine`);
            }
          }

          // PO Reconciliation Validation
          if (job.purchaseOrderId) {
            const poItem = await prisma.purchaseOrderItem.findFirst({
              where: {
                purchaseOrderId: job.purchaseOrderId,
                OR: [
                  { medicineId: matchedMed?.id },
                  { medicineName: { contains: med.name, mode: 'insensitive' } },
                ],
              },
            });
            if (!poItem) {
              validationErrors.push(`Item ${med.name} not found in linked Purchase Order`);
            } else if (med.quantity > poItem.quantity) {
              validationErrors.push(
                `Quantity ${med.quantity} exceeds ordered quantity ${poItem.quantity}`,
              );
            }
          }

          await repo.createExtractedItem({
            importJobId: jobId,
            extractedName: med.name,
            matchedMedicineId: matchedMed?.id || null,
            confidenceScore: matchedMed ? 0.95 : 0,
            batchNumber: med.batchNumber,
            expiryDate: med.expiryDate ? new Date(med.expiryDate) : null,
            quantity: med.quantity,
            unitPrice: med.unitPrice,
            gstPercentage: med.gstPercentage,
            totalAmount: Number(med.quantity) * Number(med.unitPrice),
            status: matchedMed ? 'MATCHED' : 'PENDING',
            validationErrors: validationErrors.length > 0 ? validationErrors : null,
          });
        }
      }

      // 6. Final Status based on Confidence and Errors
      let finalStatus = 'REVIEW_REQUIRED';
      const hasErrors = !allMatched || !isGstValid;

      if (confidenceScore >= 0.95 && !hasErrors) {
        finalStatus = 'AUTO_APPROVED';
      } else if (confidenceScore < 0.8) {
        finalStatus = 'FAILED';
        await repo.updateJob(jobId, tenantId, {
          importStatus: 'FAILED',
          errorMessage: 'OCR confidence too low for processing',
        });
        return;
      }

      await repo.updateJob(jobId, tenantId, { importStatus: finalStatus });

      // 7. Auto-approve if status is AUTO_APPROVED
      if (finalStatus === 'AUTO_APPROVED') {
        logger.info({ jobId }, 'Auto-approving high confidence import');
        await this.approveImport(jobId, tenantId, job.uploadedBy);
      }
    } catch (error) {
      logger.error({ error, jobId }, 'Import job failed during processing');
      await repo.updateJob(jobId, tenantId, {
        importStatus: 'FAILED',
        errorMessage: error.message,
      });
      await emitEvent(DOMAIN_EVENTS.IMPORT_FAILED, { jobId, tenantId, error: error.message });
    }
  }

  async approveImport(jobId, tenantId, userId) {
    const job = await repo.getJobById(jobId, tenantId);
    if (
      !job ||
      (job.importStatus !== 'REVIEW_REQUIRED' &&
        job.importStatus !== 'PROCESSING' &&
        job.importStatus !== 'AUTO_APPROVED')
    ) {
      throw new Error('Import job not ready for approval');
    }

    const result = await prisma.$transaction(async (tx) => {
      for (const item of job.extractedItems) {
        if (!item.matchedMedicineId || item.status === 'REJECTED') continue;

        // Create/Update Inventory Batch
        await tx.inventoryBatch.create({
          data: {
            medicineId: item.matchedMedicineId,
            batchNumber: item.batchNumber || `IMP-${Date.now()}`,
            expiryDate:
              item.expiryDate || new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
            quantity: item.quantity || 0,
            purchasePrice: parseFloat(item.unitPrice) || 0,
            sellingPrice: parseFloat(item.unitPrice) * 1.2,
            status: 'ACTIVE',
          },
        });

        // Stock Transaction Log
        await tx.stockTransaction.create({
          data: {
            tenantId,
            medicineId: item.matchedMedicineId,
            quantity: item.quantity || 0,
            type: 'STOCK_IN',
            previousStock: 0, // Simplified, should fetch real stock
            newStock: item.quantity || 0,
            referenceType: 'IMPORT',
            referenceId: jobId,
            notes: `Imported from invoice ${job.fileName}`,
          },
        });

        await tx.importExtractedItem.update({
          where: { id: item.id },
          data: { status: 'CREATED' },
        });
      }

      const updatedJob = await tx.importJob.update({
        where: { id: jobId },
        data: { importStatus: 'COMPLETED', processedAt: new Date() },
      });

      // Update PO status if reconciled
      if (job.purchaseOrderId) {
        await tx.purchaseOrder.update({
          where: { id: job.purchaseOrderId },
          data: { status: PURCHASE_ORDER_STATUS.RECEIVED },
        });
      }

      return updatedJob;
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'IMPORT_JOB_APPROVED',
      target: jobId,
      type: 'INVENTORY',
    });

    await emitEvent(DOMAIN_EVENTS.INVENTORY_CREATED, { jobId, tenantId });

    return result;
  }

  async getImportHistory(tenantId, filters) {
    const jobs = await repo.getJobs(tenantId, filters);
    return jobs.map((job) => {
      const summary = job.extractedData?.summary;
      const records =
        summary?.importedCount ??
        summary?.imported ??
        (Array.isArray(job.extractedItems) ? job.extractedItems.length : 0);

      return {
        ...job,
        status: job.importStatus,
        type: job.importType,
        records,
        supplier:
          job.extractedData?.supplier || (job.purchaseOrder?.supplier?.name ?? 'General / CSV'),
        strategy: job.extractedData?.strategy || 'Skip',
      };
    });
  }

  async getImportById(id, tenantId) {
    const job = await repo.getJobById(id, tenantId);
    if (!job) throw new Error('Import job not found');
    return job;
  }
}

export default new ImportService();
