import prisma from '../src/config/prisma.js';
import logger from '../src/shared/utils/logger.js';

async function syncExpiryStatus() {
  logger.info('[EXPIRY_SYNC] Starting daily expiry status sync...');

  const [expiredUpdated, activeUpdated] = await Promise.all([
    prisma.inventoryBatch.updateMany({
      where: {
        expiryDate: { lt: new Date() },
        status: { not: 'EXPIRED' },
      },
      data: { status: 'EXPIRED' },
    }),
    prisma.inventoryBatch.updateMany({
      where: {
        expiryDate: { gte: new Date() },
        status: 'EXPIRED',
      },
      data: { status: 'ACTIVE' },
    }),
  ]);

  logger.info(
    { expiredUpdated: expiredUpdated.count, activeUpdated: activeUpdated.count },
    '[EXPIRY_SYNC] Status sync complete',
  );

  await prisma.$disconnect();
}

syncExpiryStatus().catch((err) => {
  logger.error({ err }, '[EXPIRY_SYNC] Failed');
  process.exit(1);
});
