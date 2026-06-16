import prisma from '../src/config/prisma.js';

async function reconcileStock() {
  console.log('Starting stock reconciliation...\n');

  // Find all inventory records where currentStock != actual batch sum
  const drifted = await prisma.$queryRaw`
    SELECT
      i.id,
      i."medicineId",
      i."branchId",
      i."tenantId",
      i."currentStock",
      COALESCE(SUM(b.quantity), 0)::int AS actual_stock,
      (i."currentStock" - COALESCE(SUM(b.quantity), 0))::int AS drift
    FROM "Inventory" i
    LEFT JOIN "InventoryBatch" b
      ON b."medicineId" = i."medicineId"
      AND b."branchId" = i."branchId"
      AND b."tenantId" = i."tenantId"
      AND b."deletedAt" IS NULL
      AND b.status != 'ARCHIVED'
    GROUP BY i.id
    HAVING i."currentStock" != COALESCE(SUM(b.quantity), 0)
    ORDER BY ABS(i."currentStock" - COALESCE(SUM(b.quantity), 0)) DESC
  `;

  if (drifted.length === 0) {
    console.log('✅ No stock drift detected. All inventory records match batch sums.');
    await prisma.$disconnect();
    return;
  }

  console.log(`⚠️  Found ${drifted.length} inventory records with stock drift:\n`);

  let totalDrift = 0;
  for (const row of drifted) {
    const drift = Number(row.drift);
    totalDrift += Math.abs(drift);
    console.log(
      `  ID: ${row.id} | Medicine: ${row.medicineId} | Current: ${row.currentStock} | Actual: ${row.actual_stock} | Drift: ${drift > 0 ? '+' : ''}${drift}`,
    );
  }

  console.log(`\nTotal absolute drift: ${totalDrift} units across ${drifted.length} records.`);

  // Check for --fix flag
  if (process.argv.includes('--fix')) {
    console.log('\n🔧 Applying fixes...\n');

    let fixed = 0;
    for (const row of drifted) {
      await prisma.inventory.update({
        where: { id: row.id },
        data: { currentStock: Number(row.actual_stock) },
      });
      fixed++;
      console.log(`  Fixed: ${row.id} → ${row.actual_stock}`);
    }

    console.log(`\n✅ Fixed ${fixed} inventory records.`);
  } else {
    console.log('\nRun with --fix to apply corrections:');
    console.log('  node scripts/reconcile-stock.js --fix');
  }

  await prisma.$disconnect();
}

reconcileStock().catch((err) => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
