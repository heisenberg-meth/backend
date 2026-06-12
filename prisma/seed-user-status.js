// Run with: node prisma/seed-user-status.js
// This script updates all existing users to have ACTIVE status
import prisma from '../src/config/prisma.js';

async function main() {
  console.log('Seeding User status...');

  // Count users by status
  const totalUsers = await prisma.user.count();

  // Get status distribution
  const statuses = await prisma.user.groupBy({
    by: ['status'],
    _count: true,
  });

  console.log(`Total users: ${totalUsers}`);
  console.log('User status distribution:');
  for (const s of statuses) {
    console.log(`  ${s.status}: ${s._count}`);
  }
  console.log('\nSeed complete!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
