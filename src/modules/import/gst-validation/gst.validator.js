class GstValidator {
  validateInvoiceTotals(extractedData) {
    const { subtotal = 0, cgst = 0, sgst = 0, igst = 0, totalAmount = 0 } = extractedData;

    const calculatedTotal = Number(subtotal) + Number(cgst) + Number(sgst) + Number(igst);
    const diff = Math.abs(calculatedTotal - Number(totalAmount));

    return diff < 0.1;
  }

  calculateItemGst(quantity, unitPrice, gstPercentage) {
    const amount = Number(quantity) * Number(unitPrice);
    const gstAmount = (amount * Number(gstPercentage)) / 100;

    return {
      amount,
      gstAmount,
      total: amount + gstAmount,
    };
  }
}

export default new GstValidator();
