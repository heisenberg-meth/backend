import prisma from '../src/config/prisma.js';

async function repairDisposals() {
  console.log('Starting historical disposal repair...\n');

  // 1. Find batches that were disposed (have disposal records) but still show EXPIRED instead of ARCHIVED
  const staleExpired = await prisma.$queryRaw`
    SELECT
      b.id,
      b."batchNumber",
      b.status,
      b.quantity,
      b."medicineId",
      d.quantity AS disposed_qty,
      d."disposedAt"
    FROM "InventoryBatch" b
    INNER JOIN "InventoryDisposal" d ON d."batchId" = b.id
    WHERE b.status = 'EXPIRED'
      AND b.quantity = 0
      AND b."deletedAt" IS NULL
    ORDER BY d."disposedAt" DESC
  `;

  if (staleExpired.length === 0) {
    console.log('✅ No stale EXPIRED batches found. All disposals are properly archived.');
  } else {
    console.log(`⚠️  Found ${staleExpired.length} disposed batches still marked EXPIRED:\n`);

    for (const row of staleExpired) {
      console.log(
        `  Batch: ${row.batchNumber} | ID: ${row.id} | Qty: ${row.quantity} | Disposed: ${row.disposed_qty} @ ${row.disposedAt}`,
      );
    }

    if (process.argv.includes('--fix')) {
      const ids = staleExpired.map((r) => r.id);
      const result = await prisma.inventoryBatch.updateMany({
        where: { id: { in: ids } },
        data: { status: 'ARCHIVED' },
      });
      console.log(`\n✅ Updated ${result.count} batches from EXPIRED → ARCHIVED.`);
    } else {
      console.log('\nRun with --fix to apply corrections.');
    }
  }

  // 2. Find EXPIRED batches with quantity 0 that have NO disposal record (orphaned)
  const orphanedExpired = await prisma.$queryRaw`
    SELECT
      b.id,
      b."batchNumber",
      b.status,
      b.quantity,
      b."medicineId"
    FROM "InventoryBatch" b
    LEFT JOIN "InventoryDisposal" d ON d."batchId" = b.id
    WHERE b.status = 'EXPIRED'
      AND b.quantity = 0
      AND d.id IS NULL
      AND b."deletedAt" IS NULL
  `;

  if (orphanedExpired.length > 0) {
    console.log(
      `\n⚠️  Found ${orphanedExpired.length} orphaned EXPIRED batches (qty=0, no disposal record):\n`,
    );
    for (const row of orphanedExpired) {
      console.log(`  Batch: ${row.batchNumber} | ID: ${row.id}`);
    }

    if (process.argv.includes('--fix')) {
      const ids = orphanedExpired.map((r) => r.id);
      const result = await prisma.inventoryBatch.updateMany({
        where: { id: { in: ids } },
        data: { status: 'ARCHIVED' },
      });
      console.log(`\n✅ Archived ${result.count} orphaned batches.`);
    }
  }

  // 3. Summary
  console.log('\n--- Summary ---');
  const totalExpired = await prisma.inventoryBatch.count({
    where: { status: 'EXPIRED', deletedAt: null },
  });
  const totalArchived = await prisma.inventoryBatch.count({
    where: { status: 'ARCHIVED', deletedAt: null },
  });
  const zeroQtyExpired = await prisma.inventoryBatch.count({
    where: { status: 'EXPIRED', quantity: 0, deletedAt: null },
  });
  console.log(`Total EXPIRED batches: ${totalExpired}`);
  console.log(`Total ARCHIVED batches: ${totalArchived}`);
  console.log(`Zero-qty EXPIRED (should be ARCHIVED): ${zeroQtyExpired}`);

  await prisma.$disconnect();
}

repairDisposals().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});
