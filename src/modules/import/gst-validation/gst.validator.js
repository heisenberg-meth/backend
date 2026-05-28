/**
 * GST Validation logic for Pharmacy ERP
 */
class GstValidator {
  /**
   * Validate invoice totals based on GST formula
   * Total = Subtotal + CGST + SGST (or IGST)
   */
  validateInvoiceTotals(extractedData) {
    const { subtotal = 0, cgst = 0, sgst = 0, igst = 0, totalAmount = 0 } = extractedData;
    
    const calculatedTotal = Number(subtotal) + Number(cgst) + Number(sgst) + Number(igst);
    const diff = Math.abs(calculatedTotal - Number(totalAmount));
    
    // Allow for small rounding differences (e.g. 0.05)
    return diff < 0.1;
  }

  /**
   * Calculate GST components for a medicine item
   */
  calculateItemGst(quantity, unitPrice, gstPercentage) {
    const amount = Number(quantity) * Number(unitPrice);
    const gstAmount = (amount * Number(gstPercentage)) / 100;
    
    return {
      amount,
      gstAmount,
      total: amount + gstAmount
    };
  }
}

export default new GstValidator();
