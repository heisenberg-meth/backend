import { PrismaClient } from '@prisma/client';
import logger from './src/shared/utils/logger';
const prisma = new PrismaClient();

async function run() {
  const userId = 'd2628816-024e-4439-b89d-1c7a8534f2f5';

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    logger.info('User not found');
    return;
  }

  if (user.branchId) {
    logger.info('User already has a branch:', user.branchId);
    return;
  }

  const branch = await prisma.branch.findFirst({ where: { tenantId: user.tenantId } });

  if (!branch) {
    logger.info('No branches found for tenant', user.tenantId);
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { branchId: branch.id },
  });

  logger.info('Updated user with branchId:', branch.id);
}

(async () => {
  try {
    await run();
  } catch (error) {
    logger.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
