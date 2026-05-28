class GstCalculationService {
  calculateGstBreakdown(amount, gstPercentage, isInterstate = false) {
    const totalGst = (amount * gstPercentage) / 100;

    if (isInterstate) {
      return {
        totalGst: parseFloat(totalGst.toFixed(2)),
        cgst: 0,
        sgst: 0,
        igst: parseFloat(totalGst.toFixed(2)),
        isInterstate: true,
      };
    }

    const halfGst = totalGst / 2;
    return {
      totalGst: parseFloat(totalGst.toFixed(2)),
      cgst: parseFloat(halfGst.toFixed(2)),
      sgst: parseFloat(halfGst.toFixed(2)),
      igst: 0,
      isInterstate: false,
    };
  }

  calculateInvoiceGst(items, sourceGstin = '', targetGstin = '') {
    const sourceStateCode = sourceGstin ? sourceGstin.substring(0, 2) : '';
    const targetStateCode = targetGstin ? targetGstin.substring(0, 2) : '';
    const isInterstate = !!(sourceStateCode && targetStateCode && sourceStateCode !== targetStateCode);

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalGst = 0;

    const processedItems = items.map((item) => {
      const lineTotal = Number(item.unitPrice) * item.quantity;
      const gst = this.calculateGstBreakdown(lineTotal, item.gstPercentage, isInterstate);

      subtotal += lineTotal;
      totalCgst += gst.cgst;
      totalSgst += gst.sgst;
      totalIgst += gst.igst;
      totalGst += gst.totalGst;

      return {
        ...item,
        taxableValue: lineTotal,
        cgst: gst.cgst,
        sgst: gst.sgst,
        igst: gst.igst,
        gstAmount: gst.totalGst,
        isInterstate: gst.isInterstate,
      };
    });

    return {
      items: processedItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      cgst: parseFloat(totalCgst.toFixed(2)),
      sgst: parseFloat(totalSgst.toFixed(2)),
      igst: parseFloat(totalIgst.toFixed(2)),
      gstAmount: parseFloat(totalGst.toFixed(2)),
      isInterstate,
    };
  }

  validateGstPercentage(percentage) {
    const validRates = [0, 0.25, 1, 3, 5, 6, 12, 18, 28];
    if (!validRates.includes(percentage)) {
      return { valid: false, message: `Invalid GST rate: ${percentage}%. Valid rates: ${validRates.join(', ')}` };
    }
    return { valid: true };
  }

  determineTaxType(sourceGstin, targetGstin) {
    if (!sourceGstin || !targetGstin) return 'INTRASTATE';
    const sourceStateCode = sourceGstin.substring(0, 2);
    const targetStateCode = targetGstin.substring(0, 2);
    return sourceStateCode === targetStateCode ? 'INTRASTATE' : 'INTERSTATE';
  }
}

export default new GstCalculationService();
