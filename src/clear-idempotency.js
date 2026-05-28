import prisma from './config/prisma.js';
import redisClientProxy from './config/redis.js';
import logger from './shared/utils/logger.js';

async function main() {
  logger.info('Starting idempotency and cache purge...');
  
  // 1. Delete all payment idempotency records from PostgreSQL
  try {
    const deletedCount = await prisma.paymentIdempotency.deleteMany({});
    logger.info(`Deleted ${deletedCount.count} payment idempotency keys from DB.`);
  } catch (err) {
    logger.error('Error deleting payment idempotency keys:', err.message);
  }

  // 2. Clear all payment-related keys from Redis
  try {
    const keys = await redisClientProxy.keys('idempotency:*');
    if (keys.length > 0) {
      await redisClientProxy.del(keys);
      logger.info(`Deleted ${keys.length} idempotency keys from Redis.`);
    } else {
      logger.info('No idempotency keys found in Redis.');
    }
  } catch (err) {
    logger.error('Error flushing Redis:', err.message);
  }

  // 3. Close connections
  await prisma.$disconnect();
  logger.info('Purge completed.');
}
(async () => {
  try {
    await main();
  } catch (err) {
    logger.error(err);
  } finally {
    process.exit(0);
  }
})();
