import { PrismaClient } from '@prisma/client';
import logger from '../shared/utils/logger.js';

const globalForPrisma = globalThis;

/**
 * Prisma singleton to prevent connection exhaustion during hot-reloads.
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Ensures the database connection is active, attempting recovery if it has gone stale.
 * Use this before critical database-heavy operations like payment creation.
 */
export async function ensureDbConnection() {
  try {
    // Light-weight check
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

// Handle graceful shutdown
const gracefulShutdown = async () => {
  console.info('[PRISMA] Closing database connections...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

export default prisma;
