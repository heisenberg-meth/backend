import barcodeService from '../services/barcode.service.js';
import printingService from '../services/printing.service.js';

class BarcodeFastifyController {
  async generateBarcode(request, reply) {
    try {
      const buffer = await barcodeService.generateBarcode(request.body.text, request.body.type);
      return reply.header('Content-Type', 'image/png').send(buffer);
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async printBarcode(request, reply) {
    try {
      const labelData = await printingService.getLabelData(
        request.params.medicineId,
        request.query.batchId,
        request.tenantId,
      );
      const barcodeBuffer = await printingService.generateCode128(
        labelData.barcode || labelData.medicineName,
      );
      return reply.send({
        success: true,
        data: { label: labelData, barcodeBase64: barcodeBuffer.toString('base64') },
      });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async bulkPrint(request, reply) {
    try {
      const result = await printingService.queueBulkPrint(request.body.items, request.tenantId);
      return reply.code(202).send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new BarcodeFastifyController();
