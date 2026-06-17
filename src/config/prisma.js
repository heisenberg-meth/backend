import { PrismaClient } from '@prisma/client';
import logger from '../shared/utils/logger.js';

const globalForPrisma = globalThis;

/**
 * Prisma singleton to prevent connection exhaustion during hot-reloads.
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'stdout', level: 'info' },
      { emit: 'stdout', level: 'warn' },
    ],
  });

prisma.$on('query', (e) => {
  if (e.duration >= 2000) {
    logger.warn(
      {
        event: 'SLOW_QUERY',
        query: e.query,
        params: e.params,
        durationMs: e.duration,
      },
      `Slow database query detected: ${e.duration}ms`,
    );
  }
});

prisma.$on('error', (e) => {
  logger.error({ event: 'DB_ERROR', error: e.message }, 'Database Error');
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function ensureDbConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.warn('[PRISMA] Connection stale or lost, attempting recovery...', error.message);
    try {
      await prisma.$disconnect();
    } catch (error) {
      logger.warn({ err: error.message }, '[PRISMA] Error disconnecting database');
    }
    await prisma.$connect();
    console.info('[PRISMA] Database connection recovered.');
  }
}

const gracefulShutdown = async () => {
  console.info('[PRISMA] Closing database connections...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default prisma;
