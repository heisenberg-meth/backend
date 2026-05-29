import barcodeController from '../fastify/barcode.fastify.controller.js';
import scannerController from '../fastify/scanner.fastify.controller.js';
import qrController from '../fastify/qr.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

export default async function (fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post('/generate', {
    schema: { tags: ['Barcodes'], summary: 'Generate barcode image' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: barcodeController.generateBarcode,
  });

  fastify.get('/:medicineId/print', {
    schema: { tags: ['Barcodes'], summary: 'Get barcode print data' },
    handler: barcodeController.printBarcode,
  });

  fastify.post('/bulk-print', {
    schema: { tags: ['Barcodes'], summary: 'Queue bulk barcode print' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: barcodeController.bulkPrint,
  });

  fastify.post('/scan', {
    schema: { tags: ['Barcodes'], summary: 'Scan barcode' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: scannerController.scan,
  });

  fastify.post('/qr/verify', {
    schema: { tags: ['Barcodes'], summary: 'Verify QR code' },
    preHandler: [requirePermission('VIEW_INVENTORY')],
    handler: qrController.verify,
  });
}
