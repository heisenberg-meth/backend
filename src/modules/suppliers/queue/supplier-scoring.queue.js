import Queue from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import registerQueue from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const SUPPLIER_SCORING_QUEUE = 'viyan-medassist-supplier-scoring';

export const supplierScoringQueue = isTest ? null : registerQueue(
  new Queue(SUPPLIER_SCORING_QUEUE, {
    connection: getBullRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  }),
);

export const JOB_TYPES = {
  SCORE_ALL_SUPPLIERS: 'score-all-suppliers',
  SCORE_SINGLE_SUPPLIER: 'score-single-supplier',
  UPDATE_SUPPLIER_METRICS: 'update-supplier-metrics',
  DAILY_SCORING_SWEEP: 'daily-scoring-sweep',
};

export async function enqueueSupplierScoring(supplierId = null) {
  if (!supplierScoringQueue) return;

  if (supplierId) {
    await supplierScoringQueue.add(JOB_TYPES.SCORE_SINGLE_SUPPLIER, { supplierId });
  } else {
    await supplierScoringQueue.add(JOB_TYPES.SCORE_ALL_SUPPLIERS, {});
  }
}

export async function enqueueDailyScoringSweep() {
  if (!supplierScoringQueue) return;

  await supplierScoringQueue.add(
    JOB_TYPES.DAILY_SCORING_SWEEP,
    {},
    {
      attempts: 1,
      repeat: { pattern: '0 2 * * *' },
    },
  );
}
