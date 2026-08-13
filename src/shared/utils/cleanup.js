import logger from './logger.js';
import { closeAllQueuesAndWorkers } from '../../config/queue-registry.js';
import process from 'process';

const isTest = process.env.NODE_ENV === 'test';
const log = isTest ? { info: () => {}, warn: () => {}, error: () => {} } : logger;

export const cleanupResources = async () => {
  log.info('Starting global resource cleanup...');

  try {
    await closeAllQueuesAndWorkers();
    log.info('Queues and Workers closed');

    try {
      const prismaModule = await import('../../config/prisma.js');
      const prismaClient = prismaModule.default || prismaModule.prisma;
      if (prismaClient && typeof prismaClient.$disconnect === 'function') {
        await prismaClient.$disconnect();
      }
    } catch (err) {
      log.warn({ err: err.message }, '[CLEANUP] Error disconnecting Prisma');
    }
    log.info('Databases disconnected');

    try {
      const redisModule = await import('../../config/redis.js');
      if (typeof redisModule.quitRedis === 'function') {
        await redisModule.quitRedis();
      } else if (redisModule.default && typeof redisModule.default.quit === 'function') {
        await redisModule.default.quit();
      }
    } catch (err) {
      log.warn({ err: err.message }, '[CLEANUP] Error quitting Redis');
    }
    log.info('Redis disconnected');

    log.info('Global resource cleanup completed successfully');
  } catch (err) {
    log.error({ err }, 'Error during global resource cleanup');
  }
};
