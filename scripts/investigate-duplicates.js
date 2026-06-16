import prisma from '../src/config/prisma.js';

async function investigateDuplicates() {
  console.log('Starting medicine duplication investigation...\n');

  // Find duplicate medicine names within same tenant
  const duplicates = await prisma.$queryRaw`
    SELECT
      name,
      "tenantId",
      COUNT(*)::int AS count,
      ARRAY_AGG(id) AS ids,
      ARRAY_AGG("branchId") AS branch_ids
    FROM "Medicine"
    WHERE "deletedAt" IS NULL
    GROUP BY name, "tenantId"
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 50
  `;

  if (duplicates.length === 0) {
    console.log('✅ No duplicate medicines found.');
    await prisma.$disconnect();
    return;
  }

  console.log(`⚠️  Found ${duplicates.length} duplicate medicine groups:\n`);

  for (const dup of duplicates) {
    console.log(`  "${dup.name}" — ${dup.count} copies in tenant ${dup.tenantId}`);
    console.log(`    IDs: ${dup.ids.join(', ')}`);
    console.log(`    Branches: ${dup.branch_ids.join(', ')}`);

    // Check if they have inventory
    for (const id of dup.ids) {
      const invCount = await prisma.inventoryBatch.count({
        where: { medicineId: id, deletedAt: null, quantity: { gt: 0 } },
      });
      const totalStock = await prisma.inventoryBatch.aggregate({
        where: { medicineId: id, deletedAt: null },
        _sum: { quantity: true },
      });
      console.log(
        `    → ${id}: ${invCount} active batches, ${totalStock._sum.quantity || 0} total stock`,
      );
    }
    console.log('');
  }

  // Cross-branch vs same-branch analysis
  let crossBranch = 0;
  let sameBranch = 0;
  for (const dup of duplicates) {
    const uniqueBranches = new Set(dup.branch_ids.filter(Boolean));
    if (uniqueBranches.size > 1) {
      crossBranch++;
    } else {
      sameBranch++;
    }
  }

  console.log('--- Analysis ---');
  console.log(`Cross-branch duplicates (expected for multi-branch): ${crossBranch}`);
  console.log(`Same-branch duplicates (likely import bugs): ${sameBranch}`);

  await prisma.$disconnect();
}

investigateDuplicates().catch((err) => {
  console.error('Investigation failed:', err);
  process.exit(1);
});
