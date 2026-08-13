import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const communicationQueue = new Queue('communications', {
  connection: getBullRedis(),
});

communicationQueue.on('error', (err) => {
  logger.error({ err }, 'Communications queue error');
});

export default communicationQueue;
