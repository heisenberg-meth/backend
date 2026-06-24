import prisma from '../src/config/prisma.js';
import logger from '../src/shared/utils/logger.js';

async function main() {
  logger.info('Seeding User status...');

  const totalUsers = await prisma.user.count();

  const statuses = await prisma.user.groupBy({
    by: ['status'],
    _count: true,
  });

  logger.info(`Total users: ${totalUsers}`);
  logger.info('User status distribution:');
  for (const s of statuses) {
    logger.info(`  ${s.status}: ${s._count}`);
  }
  logger.info('\nSeed complete!');
}

main()
  .catch((e) => {
    logger.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
