import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';

const SEED_USERS = [
  {
    email: 'admin@viyan.med',
    password: 'Admin@1234',
    fullName: 'Test Admin',
    role: 'OWNER',
    shopName: 'Viyan Test Pharmacy',
  },
  {
    email: 'staff@viyan.med',
    password: 'Staff@1234',
    fullName: 'Test Staff',
    role: 'STAFF',
    shopName: 'Viyan Test Pharmacy',
  },
];

async function seed() {
  try {
    console.log('[SEED] Connecting to PostgreSQL...');
    await prisma.$queryRaw`SELECT 1`;
    console.log('[SEED] Database connected');

    for (const userData of SEED_USERS) {
      const existing = await prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existing) {
        console.log(`[SEED] User ${userData.email} already exists, skipping`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(userData.password, 10);

      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          fullName: userData.fullName,
          role: userData.role,
          tenant: {
            connectOrCreate: {
              where: { email: userData.email },
              create: {
                email: userData.email,
                name: userData.shopName,
              },
            },
          },
        },
        include: {
          tenant: true,
        },
      });

      console.log(`[SEED] Created user: ${user.email} (${user.role}) → tenant: ${user.tenant.email}`);
    }

    console.log('[SEED] Done');
    process.exit(0);
  } catch (err) {
    console.error('[SEED] Failed:', err.message);
    process.exit(1);
  }
}

seed();
