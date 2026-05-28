import scannerService from '../services/scanner.service.js';

class ScannerFastifyController {
  async scan(request, reply) {
    try {
      const start = Date.now();
      const result = await scannerService.scanBarcode(request.body.barcode, request.tenantId);
      const latencyMs = Date.now() - start;
      return reply.send({ success: true, data: result, meta: { latencyMs } });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new ScannerFastifyController();
