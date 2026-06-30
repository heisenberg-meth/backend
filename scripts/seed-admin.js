import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';

async function seedAdmin() {
  try {
    console.log('[SEED] Connecting to PostgreSQL...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('[SEED] Database connected');

    const email = 'admin@viyaninfo.com';
    const existing = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (existing) {
      console.log(`[SEED] Admin ${email} already exists`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash('Viyaninfo@.com', 10);

    const admin = await prisma.adminUser.create({
      data: {
        email: email,
        passwordHash: hashedPassword,
        name: 'Platform Admin',
        role: 'ROOT_ADMIN',
      },
    });

    console.log(`[SEED] Created platform admin: ${admin.email} (${admin.role})`);
    process.exit(0);
  } catch (err) {
    console.error('[SEED] Failed:', err.message);
    process.exit(1);
  }
}

seedAdmin();
