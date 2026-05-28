import prisma from '../src/config/prisma.js';

const SYSTEM_PLANS = [
  {
    id: 'free-trial',
    name: 'Free Trial',
    price: 0,
    billingCycle: 'one-time',
    features: ['28-day free trial', 'Full feature access', 'Up to 5 users'],
  },
  {
    id: 'basic-monthly',
    name: 'Basic Monthly',
    price: 999,
    billingCycle: 'monthly',
    features: ['Unlimited Medicines', 'Basic Analytics', 'Up to 3 users'],
  },
  {
    id: 'pro-monthly',
    name: 'Pro Monthly',
    price: 2999,
    billingCycle: 'monthly',
    features: ['Unlimited Medicines', 'Advanced Analytics', 'Priority Support', 'Up to 10 users'],
  },
];

async function seedPlans() {
  for (const plan of SYSTEM_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    });
    console.log(`Plan seeded: ${plan.id}`);
  }
}

async function fixExistingSubscriptions() {
  await prisma.subscriptionPlan.upsert({
    where: { id: 'free-trial' },
    update: {},
    create: SYSTEM_PLANS[0],
  });

  const subscriptions = await prisma.subscription.findMany({
    where: { planId: { not: 'free-trial' } },
  });

  for (const sub of subscriptions) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { planId: 'free-trial' },
    });
    console.log(`Fixed subscription ${sub.id} → planId: free-trial`);
  }

  console.log(`Fixed ${subscriptions.length} subscriptions`);
}

async function main() {
  console.log('Seeding plans...');
  await seedPlans();
  console.log('Fixing existing subscriptions...');
  await fixExistingSubscriptions();
  console.log('Seed complete.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
