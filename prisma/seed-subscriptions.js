// Run with: node prisma/seed-subscriptions.js
// Seeds subscription plans and ensures all tenants have subscriptions
import prisma from '../src/config/prisma.js';

const PLANS = [
  { id: 'plan-basic', name: 'Basic', price: 499, billingCycle: 'MONTHLY', features: ['Inventory Management', 'Billing', 'Basic Reports'] },
  { id: 'plan-professional', name: 'Professional', price: 999, billingCycle: 'MONTHLY', features: ['All Basic Features', 'CRM', 'Analytics', 'Multi-Branch'] },
  { id: 'plan-enterprise', name: 'Enterprise', price: 2499, billingCycle: 'MONTHLY', features: ['All Professional Features', 'AI Forecasting', 'Hospital Module', 'Priority Support'] },
];

async function main() {
  console.log('Seeding subscription plans...');

  // Upsert plans
  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { id: plan.id },
      update: { name: plan.name, price: plan.price, features: plan.features, billingCycle: plan.billingCycle },
      create: plan,
    });
    console.log(`  Plan "${plan.name}" (${plan.id}) ready`);
  }

  // Ensure all tenants have a subscription
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null },
    include: { subscription: true },
  });

  let created = 0;
  let updated = 0;

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

  console.log(`\nSubscriptions created: ${created}`);
  console.log(`Subscriptions verified: ${tenants.length}`);

  // Show subscription distribution
  const dist = await prisma.subscription.groupBy({
    by: ['status'],
    _count: true,
  });

  console.log('\nSubscription distribution:');
  for (const d of dist) {
    console.log(`  ${d.status}: ${d._count}`);
  }

  // Show active subscriptions count
  const activeSubs = await prisma.subscription.count({ where: { status: 'ACTIVE' } });
  const totalSubs = await prisma.subscription.count();
  console.log(`\nTotal subscriptions: ${totalSubs}`);
  console.log(`Active subscriptions: ${activeSubs}`);
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
