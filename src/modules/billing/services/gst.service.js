class GstService {
  /**
   * Calculate GST breakdown based on location
   * @param {number} basePrice 
   * @param {number} percentage 
   * @param {string} sourceGst (Branch GST)
   * @param {string} targetGst (Patient/Supplier GST)
   */
  calculateGst(basePrice, percentage, sourceGst = '', targetGst = '') {
    const safeBasePrice = Number(basePrice || 0);
    const safePercentage = Number(percentage || 0);
    
    if (isNaN(safeBasePrice) || isNaN(safePercentage)) {
      return { percentage: 0, amount: 0, cgst: 0, sgst: 0, igst: 0, isInterstate: false };
    }

    const amount = (safeBasePrice * safePercentage) / 100;
    
    // In India, the first 2 digits of GSTIN represent the State Code
    const sourceStateCode = sourceGst ? sourceGst.substring(0, 2) : '';
    const targetStateCode = targetGst ? targetGst.substring(0, 2) : '';

    const isInterstate = sourceStateCode && targetStateCode && sourceStateCode !== targetStateCode;

    if (isInterstate) {
      return {
        percentage,
        amount: parseFloat(amount.toFixed(2)),
        cgst: 0,
        sgst: 0,
        igst: parseFloat(amount.toFixed(2)),
        isInterstate: true
      };
    }

    // Intrastate: Split into CGST and SGST
    const splitAmount = amount / 2;
    return {
      percentage,
      amount: parseFloat(amount.toFixed(2)),
      cgst: parseFloat(splitAmount.toFixed(2)),
      sgst: parseFloat(splitAmount.toFixed(2)),
      igst: 0,
      isInterstate: false,
    };
  }

  /**
   * Calculate base price from final price (GST inclusive)
   */
  calculateBaseFromInclusive(finalPrice, percentage) {
    const basePrice = finalPrice / (1 + percentage / 100);
    return parseFloat(basePrice.toFixed(2));
  }
}

export default new GstService();
