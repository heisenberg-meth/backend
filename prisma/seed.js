import defaultPrisma from '../src/config/prisma.js';
import { PrismaClient } from '@prisma/client';

const standalonePrisma = new PrismaClient();

export async function seedSubscriptionPlans(dbClient = defaultPrisma || standalonePrisma) {
  console.log('[SEED] Upserting subscription plans...');

  if (dbClient.subscriptionPlan?.updateMany) {
    try {
      await dbClient.subscriptionPlan.updateMany({
        where: {
          id: { in: ['starter', 'free-trial'] },
        },
        data: {
          isActive: false,
        },
      });
    } catch (err) {
      console.warn('[SEED] Could not deactivate legacy plans:', err.message);
    }
  }

  const freePlan = await dbClient.subscriptionPlan.upsert({
    where: { id: 'free' },
    update: {
      name: 'Free Tier',
      price: 0,
      currency: 'INR',
      billingCycle: 'MONTHLY',
      durationDays: 28,
      trialDays: 28,
      features: ['28-day free access'],
      isActive: true,
    },
    create: {
      id: 'free',
      name: 'Free Tier',
      price: 0,
      currency: 'INR',
      billingCycle: 'MONTHLY',
      durationDays: 28,
      trialDays: 28,
      features: ['28-day free access'],
      isActive: true,
    },
  });

  const paidPlan = await dbClient.subscriptionPlan.upsert({
    where: { id: 'paid' },
    update: {
      name: 'Paid Plan',
      price: 599,
      currency: 'INR',
      billingCycle: 'MONTHLY',
      durationDays: 30,
      trialDays: null,
      features: ['Monthly subscription'],
      isActive: true,
    },
    create: {
      id: 'paid',
      name: 'Paid Plan',
      price: 599,
      currency: 'INR',
      billingCycle: 'MONTHLY',
      durationDays: 30,
      trialDays: null,
      features: ['Monthly subscription'],
      isActive: true,
    },
  });

  console.log('[SEED] Subscription plans seeded successfully:', { freePlan, paidPlan });
  return { freePlan, paidPlan };
}

async function main() {
  try {
    await seedSubscriptionPlans();
  } catch (error) {
    console.error('[SEED] Error seeding subscription plans:', error);
    process.exit(1);
  } finally {
    if (defaultPrisma) await defaultPrisma.$disconnect();
    await standalonePrisma.$disconnect();
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  main();
}
