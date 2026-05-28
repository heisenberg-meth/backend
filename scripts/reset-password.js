import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import readline from 'readline';

const prisma = new PrismaClient();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

async function resetPassword() {
  console.log('[PASSWORD RESET] Admin password reset utility\n');

  const email = await ask('Enter user email: ');
  const password = await ask('Enter new password (min 8 chars): ');

  if (!email || !password || password.length < 8) {
    console.error('Invalid input. Email required and password must be at least 8 characters.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  console.log(`\nPassword reset successfully for ${user.email}`);
  console.log(`User ID: ${user.id}`);
  console.log(`Role: ${user.role}`);

  await prisma.$disconnect();
  rl.close();
}

resetPassword().catch((err) => {
  console.error('[PASSWORD RESET] Error:', err);
  process.exit(1);
});
