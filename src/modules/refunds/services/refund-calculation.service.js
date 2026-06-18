class RefundCalculationService {
  NON_REFUNDABLE_CHARGES_RATE = 0;

  calculateRefundAmount(item, returnQuantity) {
    const unitPrice = Number(item.unitPrice);
    const originalQuantity = Number(item.quantity) || returnQuantity;
    const itemDiscount = Number(item.discountAmount) || 0;

    const proportionalDiscount =
      originalQuantity > 0 ? (itemDiscount / originalQuantity) * returnQuantity : 0;
    const gstPercentage = Number(item.gstPercentage);

    const lineTotal = unitPrice * returnQuantity - proportionalDiscount;
    const gstAmount = lineTotal * (gstPercentage / 100);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (Number(item.igst) > 0) {
      igst = gstAmount;
    } else {
      cgst = gstAmount / 2;
      sgst = gstAmount / 2;
    }

    return {
      subtotal: parseFloat(lineTotal.toFixed(2)),
      discountAmount: parseFloat(proportionalDiscount.toFixed(2)),
      cgst: parseFloat(cgst.toFixed(2)),
      sgst: parseFloat(sgst.toFixed(2)),
      igst: parseFloat(igst.toFixed(2)),
      gstAmount: parseFloat(gstAmount.toFixed(2)),
      totalRefund: parseFloat((lineTotal + gstAmount).toFixed(2)),
    };
  }

  calculateTotalRefund(items) {
    let subtotal = 0;
    let totalDiscountAmount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalGst = 0;
    let totalRefund = 0;

    for (const item of items) {
      subtotal += item.subtotal;
      totalDiscountAmount += item.discountAmount || 0;
      totalCgst += item.cgst;
      totalSgst += item.sgst;
      totalIgst += item.igst;
      totalGst += item.gstAmount;
      totalRefund += item.totalRefund;
    }

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discountAmount: parseFloat(totalDiscountAmount.toFixed(2)),
      cgst: parseFloat(totalCgst.toFixed(2)),
      sgst: parseFloat(totalSgst.toFixed(2)),
      igst: parseFloat(totalIgst.toFixed(2)),
      gstAmount: parseFloat(totalGst.toFixed(2)),
      totalRefund: parseFloat(totalRefund.toFixed(2)),
    };
  }
}

export default new RefundCalculationService();
