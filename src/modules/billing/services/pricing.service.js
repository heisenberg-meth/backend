import gstService from './gst.service.js';

class PricingService {
  calculateItemPricing(item, sourceGst = '', targetGst = '') {
    const { unitPrice, quantity, gstPercentage, discountPercentage = 0 } = item;

    const rawTotal = unitPrice * quantity;

    const discountAmount = (rawTotal * discountPercentage) / 100;
    const priceAfterDiscount = rawTotal - discountAmount;

    const gst = gstService.calculateGst(priceAfterDiscount, gstPercentage, sourceGst, targetGst);

    const totalPrice = priceAfterDiscount + gst.amount;

    return {
      subtotal: parseFloat(rawTotal.toFixed(2)),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      taxableAmount: parseFloat(priceAfterDiscount.toFixed(2)),
      gstAmount: gst.amount,
      totalPrice: parseFloat(totalPrice.toFixed(2)),
      gstBreakdown: gst,
    };
  }

  calculateInvoiceTotals(items, invoiceDiscountAmount = 0, sourceGst = '', targetGst = '') {
    let subtotal = 0;
    let totalItemDiscount = 0;
    let gstAmount = 0;
    let grandTotal = 0;

    const processedItems = items.map((item) => {
      const pricing = this.calculateItemPricing(item, sourceGst, targetGst);
      subtotal += pricing.subtotal;
      totalItemDiscount += pricing.discountAmount;
      gstAmount += pricing.gstAmount;
      grandTotal += pricing.totalPrice;

      return {
        ...item,
        ...pricing,
      };
    });

    grandTotal -= invoiceDiscountAmount;

    return {
      items: processedItems,
      totals: {
        subtotal: parseFloat(subtotal.toFixed(2)),
        discountAmount: parseFloat((totalItemDiscount + invoiceDiscountAmount).toFixed(2)),
        gstAmount: parseFloat(gstAmount.toFixed(2)),
        totalAmount: parseFloat(grandTotal.toFixed(2)),
      },
    };
  }
}

export default new PricingService();
