import { PrismaClient } from '@prisma/client';
import logger from '../shared/utils/logger.js';

const globalForPrisma = globalThis;

/**
 * Prisma singleton to prevent connection exhaustion during hot-reloads.
 */
const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'stdout', level: 'info' },
      { emit: 'stdout', level: 'warn' },
    ],
  });

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const start = Date.now();
        const result = await query(args);
        const duration = Date.now() - start;

        // Configurable threshold: 1000ms for slow queries
        if (duration >= 1000) {
          const rowsReturned = Array.isArray(result) ? result.length : result ? 1 : 0;
          let fieldsSelected = 'ALL_SCALARS';
          if (args.select) {
            fieldsSelected = Object.keys(args.select).join(', ');
          } else if (args.include) {
            fieldsSelected = `ALL_SCALARS + ${Object.keys(args.include).join(', ')}`;
          }

          logger.warn(
            {
              event: 'PRISMA_QUERY',
              Repository: model,
              Operation: operation,
              Duration: duration,
              RowsReturned: rowsReturned,
              FieldsSelected: fieldsSelected,
            },
            `Slow Prisma query detected on ${model}.${operation}: ${duration}ms`,
          );
        }

        return result;
      },
    },
  },
});

basePrisma.$on('query', (e) => {
  if (e.duration >= 2000) {
    logger.warn(
      {
        event: 'SLOW_SQL_QUERY',
        query: e.query,
        params: e.params,
        durationMs: e.duration,
      },
      `Slow SQL query detected: ${e.duration}ms`,
    );
  }
});

basePrisma.$on('error', (e) => {
  logger.error({ event: 'DB_ERROR', error: e.message }, 'Database Error');
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma;
}

export async function ensureDbConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.warn('[PRISMA] Connection stale or lost, attempting recovery...', error.message);
    try {
      await basePrisma.$disconnect();
    } catch (error) {
      logger.warn({ err: error.message }, '[PRISMA] Error disconnecting database');
    }
    await basePrisma.$connect();
    console.info('[PRISMA] Database connection recovered.');
  }
}

const gracefulShutdown = async () => {
  console.info('[PRISMA] Closing database connections...');
  await basePrisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default prisma;
