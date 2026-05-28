import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerWorker } from '../../../config/queue-registry.js';
import gstAggregationService from '../services/gst-aggregation.service.js';
import gstReportService from '../services/gst-report.service.js';
import gstReconciliationService from '../services/gst-reconciliation.service.js';
import gstExportService from '../services/gst-export.service.js';
import logger from '../../../shared/utils/logger.js';

const isTest = process.env.NODE_ENV === 'test';

const handlers = {
  'generate-gst-report': async (data) => {
    const { tenantId, month, year, format, branchId } = data;
    logger.info(`[GST Worker] Generating report for ${month}/${year}`);
    return gstReportService.generateReport(tenantId, { month, year, format, branchId });
  },

  'generate-monthly-summary': async (data) => {
    const { tenantId, monthDate } = data;
    logger.info(`[GST Worker] Generating monthly summary for ${monthDate}`);
    return gstAggregationService.generateMonthlySummary(tenantId, monthDate);
  },

  'run-reconciliation': async (data) => {
    const { tenantId, from, to } = data;
    logger.info(`[GST Worker] Running reconciliation from ${from} to ${to}`);
    return gstReconciliationService.reconcile(tenantId, { from, to });
  },

  'export-gst-filing': async (data) => {
    const { tenantId, month, year, format } = data;
    logger.info(`[GST Worker] Exporting GST filing for ${month}/${year}`);
    return gstExportService.exportGstFiling(tenantId, { month, year, format });
  },
};

export const gstReportWorker = isTest ? null : registerWorker(new Worker(
  'viyan-medassist-gst-reports',
  async (job) => {
    const handler = handlers[job.name];
    if (handler) {
      logger.info(`[GST Worker] Started job ${job.id} (${job.name})`);
      await handler(job.data);
      logger.info(`[GST Worker] Finished job ${job.id} (${job.name})`);
    }
  },
  { connection: getBullRedis(), concurrency: 5 },
));

export const gstMonthlyWorker = isTest ? null : registerWorker(new Worker(
  'viyan-medassist-gst-monthly',
  async (job) => {
    const handler = handlers[job.name];
    if (handler) {
      await handler(job.data);
    }
  },
  { connection: getBullRedis(), concurrency: 3 },
));

if (gstReportWorker) {
  gstReportWorker.on('failed', (job, err) => {
    logger.error(`[GST Worker] Job ${job?.id} failed: ${err.message}`);
  });
}
