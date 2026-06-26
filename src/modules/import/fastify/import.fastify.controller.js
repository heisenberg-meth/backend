import fs from 'fs';
import path from 'path';
import importService from '../services/import.service.js';
import bulkImportService from '../services/bulk-import.service.js';
import csvImportService from '../services/csv-import.service.js';
import { mainQueue } from '../../../queue/index.js';

class ImportFastifyController {
  async importPdfInvoice(request, reply) {
    try {
      const job = await importService.createImportJob(
        { type: 'PDF_INVOICE', ...request.body },
        request.tenantId,
        request.user.id,
      );
      return reply.code(202).send({ success: true, data: job });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getImportHistory(request, reply) {
    try {
      const history = await importService.getImportHistory(request.tenantId, request.query);
      return reply.send({ success: true, data: history });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getImportById(request, reply) {
    try {
      const job = await importService.getImportById(request.params.id, request.tenantId);
      return reply.send({ success: true, data: job });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async approveImport(request, reply) {
    try {
      const job = await importService.approveImport(
        request.params.id,
        request.tenantId,
        request.user.id,
      );
      return reply.send({ success: true, data: job });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getOcrPreview(request, reply) {
    try {
      const job = await importService.getImportById(request.params.id, request.tenantId);
      return reply.send({ success: true, data: job.extractedData || job.extractedItems });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async reprocessImport(request, reply) {
    try {
      const job = await importService.createImportJob(
        { type: 'PDF_INVOICE', ...request.body },
        request.tenantId,
        request.user.id,
      );
      return reply.code(202).send({ success: true, data: job });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getImportErrors(request, reply) {
    try {
      const job = await importService.getImportById(request.params.id, request.tenantId);
      const errors = (job.extractedItems || []).filter((item) => item.validationErrors);
      return reply.send({ success: true, data: errors });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async importSupplierInvoice(request, reply) {
    try {
      const job = await importService.createImportJob(
        { type: 'SUPPLIER_INVOICE', ...request.body },
        request.tenantId,
        request.user.id,
      );
      return reply.code(202).send({ success: true, data: job });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async bulkImport(request, reply) {
    try {
      const result = await bulkImportService.analyzeOrCommit(
        request.body,
        request.tenantId,
        request.branchId,
        request.user.id,
      );
      return reply.send(result);
    } catch (error) {
      console.error('BULK IMPORT ERROR');
      console.error(error);
      console.error(error.stack);

      request.log.error(error);

      return reply.code(400).send({
        success: false,
        message: error.message,
        stack: error.stack,
      });
    }
  }

  async uploadCsv(request, reply) {
    try {
      const {
        fileName,
        fileContent,
        duplicateStrategy,
        barcodeOptions: rawBarcodeOpts,
        supplier: supplierName,
      } = request.body || {};
      if (!fileContent) {
        return reply.code(400).send({
          success: false,
          errorCode: 'FILE_NOT_FOUND',
          message: 'fileContent is required',
        });
      }

      const validExtensions = ['.csv', '.xlsx'];
      const ext = fileName ? path.extname(fileName).toLowerCase() : '';
      if (!fileName || !validExtensions.includes(ext)) {
        return reply.code(400).send({
          success: false,
          errorCode: 'INVALID_FILE',
          message: 'Unsupported file type. Supported formats: .csv, .xlsx',
        });
      }

      if (ext === '.csv') {
        const firstLine = fileContent.split('\n')[0] || '';
        const lowerLine = firstLine.toLowerCase();
        const hasName = lowerLine.includes('name') || lowerLine.includes('medicine');
        if (!hasName) {
          return reply.code(400).send({
            success: false,
            errorCode: 'INVALID_TEMPLATE',
            message: 'Missing required columns in template. Ensure Medicine Name is present.',
          });
        }
      }

      const uploadsDir = new URL('../../../uploads/imports', import.meta.url).pathname;
      fs.mkdirSync(uploadsDir, { recursive: true });
      const filePath = path.join(
        uploadsDir,
        `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.csv`,
      );
      fs.writeFileSync(filePath, fileContent, 'utf-8');

      const job = await importService.createImportJob(
        {
          type: 'BULK_MEDICINES',
          fileName: fileName || 'import.csv',
          fileUrl: filePath,
        },
        request.tenantId,
        request.user.id,
      );

      const barcodeOptions = rawBarcodeOpts || { autoGen: true, overwrite: false, validate: true };

      await mainQueue.add('bulk-medicines-import', {
        jobId: job.id,
        filePath,
        tenantId: request.tenantId,
        branchId: request.branchId,
        userId: request.user.id,
        duplicateStrategy: duplicateStrategy || 'Skip',
        barcodeOptions,
        supplier: supplierName || 'None',
      });

      return reply.code(202).send({
        success: true,
        data: {
          jobId: job.id,
          status: 'queued',
          message: 'Import queued for processing',
        },
      });
    } catch (error) {
      console.error('BULK IMPORT ERROR');
      console.error(error);
      console.error(error.stack);

      request.log.error(error);

      return reply.code(400).send({
        success: false,
        message: error.message,
        stack: error.stack,
      });
    }
  }

  async getImportStatus(request, reply) {
    const { jobId } = request.params;
    try {
      const progress = await csvImportService.getProgress(jobId);
      if (!progress) {
        const job = await importService.getImportById(jobId, request.tenantId).catch(() => null);
        if (job) {
          return reply.send({
            success: true,
            data: {
              processed: 0,
              total: 0,
              status: job.importStatus.toLowerCase(),
              summary: job.extractedData,
            },
          });
        }
        return reply.send({ success: true, data: { processed: 0, total: 0, status: 'not_found' } });
      }
      return reply.send({ success: true, data: progress });
    } catch (err) {
      request.log.error({ err, jobId }, 'Import status lookup failed');
      return reply.code(500).send({
        success: false,
        error: { message: 'Failed to retrieve import status', code: 'IMPORT_STATUS_FAILED' },
      });
    }
  }
}

export default new ImportFastifyController();
