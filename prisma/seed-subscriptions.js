// Run with: node prisma/seed-subscriptions.js
// Seeds subscription plans and ensures all tenants have subscriptions
import prisma from '../src/config/prisma.js';
import logger from '../src/shared/utils/logger.js';

const PLANS = [
  {
    id: 'plan-basic',
    name: 'Basic',
    price: 499,
    billingCycle: 'MONTHLY',
    features: ['Inventory Management', 'Billing', 'Basic Reports'],
  },
  {
    id: 'plan-professional',
    name: 'Professional',
    price: 999,
    billingCycle: 'MONTHLY',
    features: ['All Basic Features', 'CRM', 'Analytics', 'Multi-Branch'],
  },
  {
    id: 'plan-enterprise',
    name: 'Enterprise',
    price: 2499,
    billingCycle: 'MONTHLY',
    features: [
      'All Professional Features',
      'AI Forecasting',
      'Hospital Module',
      'Priority Support',
    ],
  },
];

async function main() {
  logger.info('Seeding subscription plans...');

  // Upsert plans
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: {
        name: plan.name,
        price: plan.price,
        features: plan.features,
        billingCycle: plan.billingCycle,
      },
      create: plan,
    });
    logger.info(`  Plan "${plan.name}" (${plan.id}) ready`);
  }

  // Ensure all tenants have a subscription
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    include: { subscription: true },
  });

  let created = 0;

  for (const tenant of tenants) {
    if (!tenant.subscription) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 28);
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: 'plan-basic',
          status: 'TRIAL',
          startDate: tenant.createdAt,
          endDate: trialEnd,
          autoRenew: false,
        },
      });
      created++;
    }
  }

  logger.info(`\nSubscriptions created: ${created}`);
  logger.info(`Subscriptions verified: ${tenants.length}`);

  // Show subscription distribution
  const dist = await prisma.subscription.groupBy({
    by: ['status'],
    _count: true,
  });

  logger.info('\nSubscription distribution:');
  for (const d of dist) {
    logger.info(`  ${d.status}: ${d._count}`);
  }

  // Show active subscriptions count
  const activeSubs = await prisma.subscription.count({ where: { status: 'ACTIVE' } });
  const totalSubs = await prisma.subscription.count();
  logger.info(`\nTotal subscriptions: ${totalSubs}`);
  logger.info(`Active subscriptions: ${activeSubs}`);
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
