import logger from '../../../shared/utils/logger.js';

class InvoiceParser {
  parse(rawData) {
    logger.info('[IMPORT-PARSER] Standardizing OCR data');

    const standardized = {
      supplierName: rawData.supplierName || 'Unknown Supplier',
      invoiceNumber: rawData.invoiceNumber || rawData.invoice_no || null,
      invoiceDate:
        rawData.invoiceDate || rawData.date
          ? new Date(rawData.invoiceDate || rawData.date)
          : new Date(),
      orderNumber: rawData.orderNumber || rawData.po_number || null,
      subtotal: parseFloat(rawData.subtotal) || 0,
      cgst: parseFloat(rawData.cgst) || 0,
      sgst: parseFloat(rawData.sgst) || 0,
      igst: parseFloat(rawData.igst) || 0,
      totalAmount: parseFloat(rawData.totalAmount) || 0,
      medicines: (rawData.medicines || []).map((med) => this.standardizeMedicine(med)),
    };

    return standardized;
  }

  standardizeMedicine(med) {
    return {
      name: med.name || med.medicine_name || med.description,
      batchNumber: med.batchNumber || med.batch_no || med.batch,
      expiryDate: this.parseDate(med.expiryDate || med.expiry),
      quantity: parseInt(med.quantity || med.qty) || 0,
      unitPrice: parseFloat(med.unitPrice || med.rate || med.price) || 0,
      gstPercentage: parseFloat(med.gstPercentage || med.gst_pct || med.tax) || 0,
    };
  }

  parseDate(dateStr) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr);
    } catch (e) {
      logger.error(`[IMPORT-PARSER] Failed to parse date: ${dateStr}`, e);
      return null;
    }
  }
}

export default new InvoiceParser();
