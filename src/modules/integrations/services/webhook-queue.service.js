import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

export const webhookQueue = isTest
  ? null
  : registerQueue(
      new Queue('webhook-queue', {
        connection: getBullRedis(),
      }),
    );
