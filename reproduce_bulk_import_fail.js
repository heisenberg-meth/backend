import bulkImportService from './src/modules/import/services/bulk-import.service.js';
import prisma from './src/config/prisma.js';

async function reproduce() {
  const tenantId = 'a8b601b8-2a88-489e-ac66-9ca2f612f9a8';
  const branchId = '31e474a0-62c1-4d2f-8e15-88deccff04cd';
  const userId = 'd95695b9-f5ab-461f-9be0-cdb8b7e4de1e';

  const payload = {
    medicines: [
      {
        name: 'New Medicine ' + Date.now(),
        qty: 10,
        price: 100,
        expiry: '2027-12-31',
        batch: 'BATCH-' + Date.now(),
        barcode: 'BC-' + Date.now()
      }
    ],
    dryRun: false,
    duplicateStrategy: 'Skip'
  };

  try {
    console.log('Starting bulk import reproduction...');
    const result = await bulkImportService.analyzeOrCommit(payload, tenantId, branchId, userId);
    console.log('Import successful:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('BULK IMPORT FAILED');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

reproduce();
