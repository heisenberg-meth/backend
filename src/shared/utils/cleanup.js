import logger from './logger.js';
import { closeAllQueuesAndWorkers } from '../../config/queue-registry.js';
import prisma from '../../config/prisma.js';
import { quitRedis } from '../../config/redis.js';

const isTest = process.env.NODE_ENV === 'test';
const log = isTest ? { info: () => {}, warn: () => {}, error: () => {} } : logger;

export const cleanupResources = async () => {
  log.info('Starting global resource cleanup...');

  try {
    await closeAllQueuesAndWorkers();
    log.info('Queues and Workers closed');

    if (typeof prisma.$disconnect === 'function') {
      try {
        await prisma.$disconnect();
      } catch (err) {
        log.warn({ err: err.message }, '[CLEANUP] Error disconnecting Prisma');
      }
    }
    log.info('Databases disconnected');

    if (typeof quitRedis === 'function') {
      try {
        await quitRedis();
      } catch (err) {
        log.warn({ err: err.message }, '[CLEANUP] Error quitting Redis');
      }
    }
    log.info('Redis disconnected');

    log.info('Global resource cleanup completed successfully');
  } catch (err) {
    log.error({ err }, 'Error during global resource cleanup');
  }
};
