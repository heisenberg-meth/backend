import { Queue, Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import dashboardAggregationService from '../aggregations/dashboard.aggregation.service.js';
import dashboardAggregationRepository from '../repositories/dashboard.aggregation.repository.js';
import { registerQueue, registerWorker } from '../../../config/queue-registry.js';

const QUEUE_NAME = 'dashboard-aggregation';

let dashboardWorker;

export function initDashboardWorker() {
  if (process.env.NODE_ENV === 'test') return;

  registerQueue(new Queue(QUEUE_NAME, { connection: getBullRedis() }));

  dashboardWorker = registerWorker(
    new Worker(
      QUEUE_NAME,
      async (job) => {
        const { tenantId, branchId, snapshotType } = job.data;

        logger.info(
          { job: job.name, tenantId, branchId, snapshotType },
          'Dashboard aggregation job started',
        );

        switch (job.name) {
          case 'REFRESH_ALL_SNAPSHOTS':
            await dashboardAggregationService.refreshAllSnapshots(tenantId, branchId);
            break;

          case 'REFRESH_OVERVIEW':
            await dashboardAggregationService._computeAndCacheOverview(tenantId, branchId);
            break;

          case 'REFRESH_SALES_SUMMARY':
            await dashboardAggregationService._computeAndCacheSalesSummary(tenantId, branchId);
            break;

          case 'REFRESH_INVENTORY_HEALTH':
            await dashboardAggregationService._computeAndCacheInventoryHealth(tenantId, branchId);
            break;

          case 'REFRESH_ALERTS':
            await dashboardAggregationService._computeAndCacheAlerts(tenantId, branchId);
            break;

          case 'INVALIDATE_CACHE':
            await dashboardAggregationRepository.invalidateSnapshots(tenantId, branchId);
            break;

          default:
            logger.warn({ jobName: job.name }, 'Unknown dashboard aggregation job');
        }

        logger.info({ job: job.name, tenantId, branchId }, 'Dashboard aggregation job completed');
      },
      {
        connection: getBullRedis(),
        concurrency: 3,
      },
    ),
  );

  dashboardWorker.on('failed', (job, err) => {
    logger.error(
      { job: job?.name, jobId: job?.id, err: err.message },
      'Dashboard aggregation job failed',
    );
  });

  logger.info('Dashboard aggregation worker initialized');
}
