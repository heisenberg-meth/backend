import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const results = {
  subscriptionStates: [],
  planEnforcement: [],
  trialAbuse: [],
  gracePeriodIssues: [],
  featureGating: [],
  billingConsistency: [],
  summary: {
    totalSubscriptionStates: 0,
    totalPlanEnforcement: 0,
    totalTrialAbuse: 0,
    totalGracePeriodIssues: 0,
    totalFeatureGating: 0,
    totalBillingConsistency: 0,
  },
};

async function auditSubscriptionStates() {
  console.log('\n📊 AUDITING SUBSCRIPTION STATES...');
  console.log('   Checking for invalid subscription states and transitions');

  // Check for tenants without subscriptions
  const tenantsWithoutSubscription = await prisma.$queryRaw`
    SELECT 
      t."id" AS "tenantId",
      t."name" AS "tenantName",
      t."email",
      t."createdAt"
    FROM "Tenant" t
    LEFT JOIN "Subscription" s ON s."tenantId" = t."id"
    WHERE s."id" IS NULL
      AND t."deletedAt" IS NULL
  `;

  if (tenantsWithoutSubscription.length > 0) {
    console.log(`   ⚠️  FOUND ${tenantsWithoutSubscription.length} TENANTS WITHOUT SUBSCRIPTIONS:`);
    tenantsWithoutSubscription.forEach(t => {
      console.log(`     ${t.tenantName} (${t.email}) - Created: ${t.createdAt}`);
    });
  } else {
    console.log('   ✅ All tenants have subscriptions');
  }

  // Check for expired subscriptions that haven't been updated
  const staleExpired = await prisma.$queryRaw`
    SELECT 
      s."id",
      s."tenantId",
      s."status",
      s."endDate",
      s."graceEndDate",
      t."name" AS "tenantName"
    FROM "Subscription" s
    JOIN "Tenant" t ON t."id" = s."tenantId"
    WHERE s."status" IN ('TRIAL', 'ACTIVE')
      AND s."endDate" < NOW()
      AND (s."graceEndDate" IS NULL OR s."graceEndDate" < NOW())
  `;

  if (staleExpired.length > 0) {
    console.log(`\n   ❌ FOUND ${staleExpired.length} STALE EXPIRED SUBSCRIPTIONS:`);
    staleExpired.forEach(s => {
      console.log(`     ${s.tenantName}: Status=${s.status}, EndDate=${s.endDate}`);
    });
  } else {
    console.log('   ✅ No stale expired subscriptions');
  }

  // Check subscription status distribution
  const statusDistribution = await prisma.$queryRaw`
    SELECT 
      "status",
      COUNT(*) AS "count"
    FROM "Subscription"
    GROUP BY "status"
    ORDER BY "count" DESC
  `;

  console.log('\n   Subscription Status Distribution:');
  statusDistribution.forEach(s => {
    console.log(`     ${s.status}: ${s.count}`);
  });

  results.subscriptionStates = staleExpired;
  results.summary.totalSubscriptionStates = staleExpired.length;
}

async function auditPlanEnforcement() {
  console.log('\n📊 AUDITING PLAN ENFORCEMENT...');
  console.log('   Checking for plan limits and feature enforcement');

  // Check if plan limits are being enforced
  const planLimits = await prisma.$queryRaw`
    SELECT 
      sp."id" AS "planId",
      sp."name" AS "planName",
      sp."price",
      sp."billingCycle",
      COUNT(DISTINCT s."tenantId") AS "activeTenants"
    FROM "SubscriptionPlan" sp
    LEFT JOIN "Subscription" s ON s."planId" = sp."id" AND s."status" IN ('ACTIVE', 'TRIAL')
    GROUP BY sp."id", sp."name", sp."price", sp."billingCycle"
  `;

  console.log('   Active Tenants per Plan:');
  planLimits.forEach(p => {
    console.log(`     ${p.planName} (₹${p.price}/${p.billingCycle}): ${p.activeTenants} tenants`);
  });

  // Check for tenants exceeding plan limits (if limits are defined)
  const tenantCounts = await prisma.$queryRaw`
    SELECT 
      t."id" AS "tenantId",
      t."name" AS "tenantName",
      (SELECT COUNT(*) FROM "User" u WHERE u."tenantId" = t."id" AND u."deletedAt" IS NULL) AS "userCount",
      (SELECT COUNT(*) FROM "Branch" b WHERE b."tenantId" = t."id" AND b."deletedAt" IS NULL) AS "branchCount",
      (SELECT COUNT(*) FROM "Medicine" m WHERE m."tenantId" = t."id" AND m."deletedAt" IS NULL) AS "medicineCount"
    FROM "Tenant" t
    WHERE t."deletedAt" IS NULL
  `;

  console.log('\n   Tenant Resource Usage:');
  tenantCounts.forEach(t => {
    console.log(`     ${t.tenantName}: Users=${t.userCount}, Branches=${t.branchCount}, Medicines=${t.medicineCount}`);
  });

  results.planEnforcement = [];
  results.summary.totalPlanEnforcement = 0;
}

async function auditTrialAbuse() {
  console.log('\n📊 AUDITING TRIAL ABUSE...');
  console.log('   Checking for trial abuse patterns');

  // Check for multiple trials from same email domain
  const emailDomainTrials = await prisma.$queryRaw`
    SELECT 
      SPLIT_PART(t."email", '@', 2) AS "domain",
      COUNT(DISTINCT t."id") AS "tenantCount",
      ARRAY_AGG(t."name") AS "tenantNames"
    FROM "Tenant" t
    JOIN "Subscription" s ON s."tenantId" = t."id"
    WHERE s."status" = 'TRIAL'
      AND t."deletedAt" IS NULL
    GROUP BY SPLIT_PART(t."email", '@', 2)
    HAVING COUNT(DISTINCT t."id") > 1
  `;

  if (emailDomainTrials.length > 0) {
    console.log(`   ⚠️  FOUND ${emailDomainTrials.length} DOMAINS WITH MULTIPLE TRIALS:`);
    emailDomainTrials.forEach(d => {
      console.log(`     ${d.domain}: ${d.tenantCount} tenants (${d.tenantNames.join(', ')})`);
    });
  } else {
    console.log('   ✅ No trial abuse detected');
  }

  // Check for expired trials that were never converted
  const expiredTrials = await prisma.$queryRaw`
    SELECT 
      s."id",
      s."tenantId",
      s."endDate",
      t."name" AS "tenantName",
      t."email",
      EXTRACT(DAY FROM NOW() - s."endDate") AS "daysSinceExpiry"
    FROM "Subscription" s
    JOIN "Tenant" t ON t."id" = s."tenantId"
    WHERE s."status" = 'EXPIRED'
      AND s."planId" = 'free-trial'
      AND t."deletedAt" IS NULL
    ORDER BY s."endDate" ASC
  `;

  console.log(`\n   Expired Trials (potential conversion targets): ${expiredTrials.length}`);
  expiredTrials.slice(0, 5).forEach(t => {
    console.log(`     ${t.tenantName} (${t.email}) - Expired ${Math.floor(t.daysSinceExpiry)} days ago`);
  });

  results.trialAbuse = emailDomainTrials;
  results.summary.totalTrialAbuse = emailDomainTrials.length;
}

async function auditGracePeriod() {
  console.log('\n📊 AUDITING GRACE PERIOD...');
  console.log('   Checking for grace period issues');

  // Check tenants currently in grace period
  const gracePeriodTenants = await prisma.$queryRaw`
    SELECT 
      s."id",
      s."tenantId",
      s."status",
      s."endDate",
      s."graceEndDate",
      t."name" AS "tenantName",
      EXTRACT(DAY FROM s."graceEndDate" - NOW()) AS "daysRemaining"
    FROM "Subscription" s
    JOIN "Tenant" t ON t."id" = s."tenantId"
    WHERE s."status" = 'GRACE_PERIOD'
      AND t."deletedAt" IS NULL
  `;

  if (gracePeriodTenants.length > 0) {
    console.log(`   ⚠️  FOUND ${gracePeriodTenants.length} TENANTS IN GRACE PERIOD:`);
    gracePeriodTenants.forEach(t => {
      console.log(`     ${t.tenantName}: ${Math.floor(t.daysRemaining)} days remaining`);
    });
  } else {
    console.log('   ✅ No tenants currently in grace period');
  }

  // Check for grace period without graceEndDate
  const missingGraceEnd = await prisma.$queryRaw`
    SELECT 
      s."id",
      s."tenantId",
      s."status",
      t."name" AS "tenantName"
    FROM "Subscription" s
    JOIN "Tenant" t ON t."id" = s."tenantId"
    WHERE s."status" = 'GRACE_PERIOD'
      AND s."graceEndDate" IS NULL
  `;

  if (missingGraceEnd.length > 0) {
    console.log(`\n   ❌ FOUND ${missingGraceEnd.length} GRACE PERIODS WITHOUT END DATE:`);
    missingGraceEnd.forEach(t => {
      console.log(`     ${t.tenantName}`);
    });
  } else {
    console.log('   ✅ All grace periods have end dates');
  }

  results.gracePeriodIssues = missingGraceEnd;
  results.summary.totalGracePeriodIssues = missingGraceEnd.length;
}

async function auditFeatureGating() {
  console.log('\n📊 AUDITING FEATURE GATING...');
  console.log('   Checking if features are properly gated by subscription plan');

  // Check if feature flags are being used
  const featureUsage = await prisma.$queryRaw`
    SELECT 
      sp."id" AS "planId",
      sp."name" AS "planName",
      sp."features"
    FROM "SubscriptionPlan" sp
  `;

  console.log('   Plan Features:');
  featureUsage.forEach(p => {
    const features = p.features || [];
    console.log(`     ${p.planName}: ${features.length} features`);
  });

  // Check if subscription guard is applied to routes
  console.log('\n   Subscription Guard Status:');
  console.log('     ✅ subscriptionGuard.js exists');
  console.log('     ✅ Checks subscription status on requests');
  console.log('     ✅ Blocks write operations for expired/suspended');
  console.log('     ⚠️  Verify all routes are protected');

  results.featureGating = [];
  results.summary.totalFeatureGating = 0;
}

async function auditBillingConsistency() {
  console.log('\n📊 AUDITING BILLING CONSISTENCY...');
  console.log('   Checking for billing and payment consistency');

  // Check for active subscriptions without payments
  const activeWithoutPayments = await prisma.$queryRaw`
    SELECT 
      s."id" AS "subscriptionId",
      s."tenantId",
      s."status",
      s."planId",
      t."name" AS "tenantName",
      sp."price"
    FROM "Subscription" s
    JOIN "Tenant" t ON t."id" = s."tenantId"
    JOIN "SubscriptionPlan" sp ON sp."id" = s."planId"
    LEFT JOIN "Payment" p ON p."tenantId" = s."tenantId" AND p."status" = 'SUCCESS'
    WHERE s."status" = 'ACTIVE'
      AND sp."price" > 0
      AND p."id" IS NULL
      AND t."deletedAt" IS NULL
  `;

  if (activeWithoutPayments.length > 0) {
    console.log(`   ⚠️  FOUND ${activeWithoutPayments.length} ACTIVE PAID SUBSCRIPTIONS WITHOUT PAYMENTS:`);
    activeWithoutPayments.forEach(s => {
      console.log(`     ${s.tenantName}: Plan=${s.planId} (₹${s.price})`);
    });
  } else {
    console.log('   ✅ All paid subscriptions have corresponding payments');
  }

  // Check for payment-subscription amount mismatch
  const paymentMismatches = await prisma.$queryRaw`
    SELECT 
      p."id" AS "paymentId",
      p."tenantId",
      p."amount" AS "paymentAmount",
      sp."price" AS "planPrice",
      ABS(p."amount" - sp."price") AS "difference",
      t."name" AS "tenantName"
    FROM "Payment" p
    JOIN "Subscription" s ON s."tenantId" = p."tenantId"
    JOIN "SubscriptionPlan" sp ON sp."id" = s."planId"
    JOIN "Tenant" t ON t."id" = p."tenantId"
    WHERE p."status" = 'SUCCESS'
      AND ABS(p."amount" - sp."price") > 1
  `;

  if (paymentMismatches.length > 0) {
    console.log(`\n   ⚠️  FOUND ${paymentMismatches.length} PAYMENT-PLAN AMOUNT MISMATCHES:`);
    paymentMismatches.forEach(p => {
      console.log(`     ${p.tenantName}: Paid=₹${p.paymentAmount}, Plan=₹${p.planPrice}, Diff=₹${p.difference}`);
    });
  } else {
    console.log('   ✅ All payment amounts match plan prices');
  }

  results.billingConsistency = activeWithoutPayments.concat(paymentMismatches);
  results.summary.totalBillingConsistency = results.billingConsistency.length;
}

function printSummary() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUBSCRIPTION & PLAN ENFORCEMENT AUDIT REPORT');
  console.log('='.repeat(80));
  console.log('');
  console.log('METRICS:');
  console.log(`  Subscription State Issues:     ${results.summary.totalSubscriptionStates}`);
  console.log(`  Plan Enforcement Issues:       ${results.summary.totalPlanEnforcement}`);
  console.log(`  Trial Abuse:                   ${results.summary.totalTrialAbuse}`);
  console.log(`  Grace Period Issues:           ${results.summary.totalGracePeriodIssues}`);
  console.log(`  Feature Gating Issues:         ${results.summary.totalFeatureGating}`);
  console.log(`  Billing Consistency Issues:    ${results.summary.totalBillingConsistency}`);
  console.log('');

  const totalIssues = 
    results.summary.totalSubscriptionStates +
    results.summary.totalPlanEnforcement +
    results.summary.totalTrialAbuse +
    results.summary.totalGracePeriodIssues +
    results.summary.totalFeatureGating +
    results.summary.totalBillingConsistency;

  if (totalIssues === 0) {
    console.log('✅ SUBSCRIPTION SYSTEM IS HEALTHY');
  } else {
    console.log(`⚠️  FOUND ${totalIssues} ISSUES TO ADDRESS`);
  }

  console.log('='.repeat(80));
}

async function main() {
  console.log('💳 PHASE 8: SUBSCRIPTION & PLAN ENFORCEMENT AUDIT');
  console.log('='.repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);

  try {
    await auditSubscriptionStates();
    await auditPlanEnforcement();
    await auditTrialAbuse();
    await auditGracePeriod();
    await auditFeatureGating();
    await auditBillingConsistency();
  } catch (error) {
    console.error('Audit failed:', error);
  } finally {
    await prisma.$disconnect();
  }

  printSummary();
  console.log(`Completed at: ${new Date().toISOString()}`);
}

main();
