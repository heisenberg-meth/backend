import prisma from '../src/config/prisma.js';

const plans = [
  {
    id: 'free-trial',
    name: 'Free Trial',
    price: 0,
    currency: 'INR',
    billingCycle: 'MONTHLY',
    maxUsers: 5,
    maxBranches: 1,
    maxBatches: 5000,
    trialDays: 28,
    features: [
      'CREDIT_NOTES',
      'REPORTS_PDF',
      'REPORTS_EXCEL',
      'ADVANCED_REPORTS',
      'PREMIUM_ANALYTICS',
    ],
    isActive: true,
  },
  {
    id: 'free',
    name: 'Free Plan',
    price: 0,
    currency: 'INR',
    billingCycle: 'MONTHLY',
    maxUsers: 1,
    maxBranches: 1,
    maxBatches: 500,
    trialDays: null,
    features: ['CREDIT_NOTES'],
    isActive: true,
  },
  {
    id: 'starter',
    name: 'Starter Plan',
    price: 599,
    currency: 'INR',
    billingCycle: 'MONTHLY',
    maxUsers: 3,
    maxBranches: 2,
    maxBatches: 10000,
    trialDays: null,
    features: ['CREDIT_NOTES', 'REPORTS_PDF'],
    isActive: true,
  },
  {
    id: 'professional',
    name: 'Professional Plan',
    price: 2999,
    currency: 'INR',
    billingCycle: 'MONTHLY',
    maxUsers: 10,
    maxBranches: 5,
    maxBatches: 50000,
    trialDays: null,
    features: [
      'CREDIT_NOTES',
      'REPORTS_PDF',
      'REPORTS_EXCEL',
      'PREMIUM_ANALYTICS',
    ],
    isActive: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise Plan',
    price: 9999,
    currency: 'INR',
    billingCycle: 'MONTHLY',
    maxUsers: -1,
    maxBranches: -1,
    maxBatches: -1,
    trialDays: null,
    features: [
      'CREDIT_NOTES',
      'REPORTS_PDF',
      'REPORTS_EXCEL',
      'ADVANCED_REPORTS',
      'PREMIUM_ANALYTICS',
    ],
    isActive: true,
  },
];

for (const plan of plans) {
  await prisma.subscriptionPlan.upsert({
    where: { id: plan.id },
    update: plan,
    create: plan,
  });
}

console.log(`Seeded ${plans.length} subscription plans.`);

await prisma.$disconnect();
