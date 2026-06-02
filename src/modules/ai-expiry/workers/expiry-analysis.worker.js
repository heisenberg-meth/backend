import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import expiryAIService from '../services/expiry-ai.service.js';
import discountEngineService from '../services/discount-engine.service.js';
import prisma from '../../../config/prisma.js';

const isTest = process.env.NODE_ENV === 'test';

const expiryWorker = isTest
  ? null
  : new Worker(
      'expiry-queue',
      async (job) => {
        if (job.name === 'RUN_EXPIRY_ANALYSIS') {
          const { tenantId } = job.data;
          logger.info({ tenantId }, '[EXPIRY_WORKER] Starting analysis');

          await expiryAIService.analyzeExpiryRisks(tenantId);

          const risks = await prisma.expiryRiskPrediction.findMany({ where: { tenantId } });
          for (const risk of risks) {
            await discountEngineService.generateDiscount(risk);
          }
        }
      },
      { connection: getBullRedis() },
    );

if (expiryWorker) {
  expiryWorker.on('failed', (job, err) => {
    logger.error({ job, err }, '[EXPIRY_WORKER] Job failed');
  });
}

export default expiryWorker;
