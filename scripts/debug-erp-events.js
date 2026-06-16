import { Queue } from 'bullmq';
import { getBullRedis } from '../src/config/redis.js';
import logger from '../src/shared/utils/logger.js';

const queue = new Queue('erp-events', {
  connection: getBullRedis(),
});

logger.log(await queue.getJobCounts());

const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, 20, true);

for (const job of jobs) {
  logger.log({
    id: job.id,
    name: job.name,
    data: job.data,
  });
}

process.exit(0);
