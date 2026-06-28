import prisma from '../src/config/prisma.js';

async function run() {
  console.log("Running reconciliation...");
  const result = await prisma.$executeRawUnsafe(`
    UPDATE "InventoryBatch"
    SET "availableQuantity" = GREATEST(quantity - COALESCE("reservedQuantity", 0), 0);
  `);
  console.log("Reconciliation complete. Rows affected:", result);
  process.exit(0);
}
run().catch(console.error);
