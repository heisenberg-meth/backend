import prisma from './config/prisma.js';

async function run() {
  try {
    console.log('Starting PurchaseOrder repair process...');

    // Find all branches
    const branches = await prisma.branch.findMany();
    if (branches.length === 0) {
      console.log('No branches found in database. Cannot repair PurchaseOrders.');
      return;
    }

    console.log(`Found ${branches.length} branches.`);

    // Check if target branch exists
    const targetBranchId = '24ac4f09-4833-46cf-be3a-b71b77ea6461';
    let branchToUse = branches.find((b) => b.id === targetBranchId);

    if (!branchToUse) {
      branchToUse = branches[0];
      console.log(
        `Target branch ${targetBranchId} not found. Using fallback branch: ${branchToUse.name} (${branchToUse.id})`,
      );
    } else {
      console.log(`Using target branch: ${branchToUse.name} (${branchToUse.id})`);
    }

    const nullPOs = await prisma.purchaseOrder.findMany({
      where: { branchId: null },
    });

    console.log(`Found ${nullPOs.length} PurchaseOrders with null branchId.`);

    if (nullPOs.length > 0) {
      const updateResult = await prisma.purchaseOrder.updateMany({
        where: { branchId: null },
        data: { branchId: branchToUse.id },
      });
      console.log(`Successfully updated ${updateResult.count} PurchaseOrders.`);
    } else {
      console.log('No PurchaseOrders required repair.');
    }
  } catch (err) {
    console.error('Error during repair:', err);
  } finally {
    await prisma.$disconnect();
    console.log('Prisma disconnected.');
  }
}

run();
