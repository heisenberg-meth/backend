import logger from '../../../shared/utils/logger.js';

class OcrService {
  async extractInvoiceData(fileUrl) {
    logger.info(`[IMPORT-OCR] Processing file: ${fileUrl}`);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    return {
      confidence: 0.98,
      provider: 'MOCK_PROVIDER',
      data: {
        supplierName: 'ABC Pharma Solutions',
        invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        invoiceDate: new Date().toISOString(),
        subtotal: 5000,
        cgst: 450,
        sgst: 450,
        totalAmount: 5900,
        medicines: [
          {
            name: 'Dolo 650',
            batchNumber: 'B2026-X',
            expiryDate: '2027-12-01',
            quantity: 100,
            unitPrice: 20,
            gstPercentage: 18,
          },
          {
            name: 'Amoxicillin 500mg',
            batchNumber: 'AX-992',
            expiryDate: '2026-06-01',
            quantity: 50,
            unitPrice: 45,
            gstPercentage: 12,
          },
        ],
      },
    };
  }
}

export default new OcrService();
