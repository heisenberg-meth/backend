import prisma from '../src/config/prisma.js';

async function mergeDuplicates(model, nameField, tenantField, label) {
  console.log(`\n=== Cleaning up duplicate ${label} ===`);

  const all = await prisma[model].findMany({
    where: { deletedAt: null },
    select: { id: true, [tenantField]: true, [nameField]: true },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map();
  for (const entry of all) {
    const key = `${entry[tenantField]}|${entry[nameField].toLowerCase().trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  let mergedCount = 0;
  for (const [, entries] of groups) {
    if (entries.length <= 1) continue;

    const keep = entries[0];
    const remove = entries.slice(1);
    const removeIds = remove.map((r) => r.id);

    console.log(
      `  Merging ${removeIds.length} duplicates of "${entries[0][nameField]}" into id=${keep.id}`,
    );

    if (model === 'medicineCategory') {
      await prisma.medicine.updateMany({
        where: { categoryId: { in: removeIds }, deletedAt: null },
        data: { categoryId: keep.id },
      });
    } else if (model === 'manufacturer') {
      await prisma.medicine.updateMany({
        where: { manufacturerId: { in: removeIds }, deletedAt: null },
        data: { manufacturerId: keep.id },
      });
    }

    await prisma[model].updateMany({
      where: { id: { in: removeIds } },
      data: { deletedAt: new Date() },
    });

    mergedCount += removeIds.length;
  }

  console.log(`  Total ${label} duplicates merged: ${mergedCount}`);
  return mergedCount;
}

async function main() {
  console.log('Starting duplicate cleanup...');

  await mergeDuplicates('medicineCategory', 'name', 'tenantId', 'categories');
  await mergeDuplicates('manufacturer', 'name', 'tenantId', 'manufacturers');

  console.log('\n=== Verification ===');

  const catDups = await prisma.$queryRaw`
    SELECT "tenantId", LOWER("name") as name, COUNT(*)
    FROM "MedicineCategory"
    WHERE "deletedAt" IS NULL
    GROUP BY "tenantId", LOWER("name")
    HAVING COUNT(*) > 1
  `;
  console.log(`Remaining duplicate categories: ${catDups.length}`);

  const mfrDups = await prisma.$queryRaw`
    SELECT "tenantId", LOWER("name") as name, COUNT(*)
    FROM "Manufacturer"
    WHERE "deletedAt" IS NULL
    GROUP BY "tenantId", LOWER("name")
    HAVING COUNT(*) > 1
  `;
  console.log(`Remaining duplicate manufacturers: ${mfrDups.length}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
