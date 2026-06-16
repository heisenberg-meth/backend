// Run with: node prisma/seed-user-status.js
// This script updates all existing users to have ACTIVE status
import prisma from '../src/config/prisma.js';
import logger from '../src/shared/utils/logger.js';

async function main() {
  logger.info('Seeding User status...');

  // Count users by status
  const totalUsers = await prisma.user.count();

  // Get status distribution
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
