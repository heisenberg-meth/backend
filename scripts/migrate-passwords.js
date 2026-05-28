import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function migratePasswords() {
  console.log('[PASSWORD MIGRATION] Starting password hash migration...');

  const users = await prisma.user.findMany();
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const isAlreadyHashed =
        user.password.startsWith('$2a$') ||
        user.password.startsWith('$2b$') ||
        user.password.startsWith('$2y$');

      if (isAlreadyHashed) {
        skipped++;
        continue;
      }

      console.log(`[PASSWORD MIGRATION] Migrating password for user: ${user.email} (${user.id})`);
      console.log(`  Current password length: ${user.password.length}, starts with: "${user.password.substring(0, 10)}..."`);

      const hashedPassword = await bcrypt.hash(user.password, 12);

      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      migrated++;
      console.log(`  -> Migrated successfully`);
    } catch (err) {
      errors++;
      console.error(`[PASSWORD MIGRATION] Error migrating user ${user.email}:`, err.message);
    }
  }

  console.log('\n[PASSWORD MIGRATION] Complete!');
  console.log(`  Total users: ${users.length}`);
  console.log(`  Already hashed (skipped): ${skipped}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}

migratePasswords().catch((err) => {
  console.error('[PASSWORD MIGRATION] Fatal error:', err);
  process.exit(1);
});
