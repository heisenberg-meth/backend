import gstService from '../../src/modules/billing/services/gst.service.js';
import pricingService from '../../src/modules/billing/services/pricing.service.js';
import { describe, it, expect } from '@jest/globals';

describe('GstService Unit Tests', () => {
  it('should calculate GST correctly', () => {
    const result = gstService.calculateGst(100, 12);
    expect(result.amount).toBe(12);
    expect(result.cgst).toBe(6);
    expect(result.sgst).toBe(6);
  });

  it('should calculate base from inclusive price', () => {
    const base = gstService.calculateBaseFromInclusive(112, 12);
    expect(base).toBe(100);
  });
});

describe('PricingService Unit Tests', () => {
  it('should calculate item pricing with discount', () => {
    const item = {
      unitPrice: 100,
      quantity: 2,
      gstPercentage: 12,
      discountPercentage: 10,
    };

    const result = pricingService.calculateItemPricing(item);

    // subtotal = 100 * 2 = 200
    // discount = 10% of 200 = 20
    // taxable = 200 - 20 = 180
    // gst = 12% of 180 = 21.6
    // total = 180 + 21.6 = 201.6

    expect(result.subtotal).toBe(200);
    expect(result.discountAmount).toBe(20);
    expect(result.taxableAmount).toBe(180);
    expect(result.gstAmount).toBe(21.6);
    expect(result.totalPrice).toBe(201.6);
  });

  it('should calculate invoice totals correctly', () => {
    const items = [
      { unitPrice: 100, quantity: 1, gstPercentage: 12, discountPercentage: 0 },
      { unitPrice: 200, quantity: 1, gstPercentage: 18, discountPercentage: 10 }
    ];

    const result = pricingService.calculateInvoiceTotals(items, 50);

    // Item 1: price 100, gst 12, total 112
    // Item 2: price 200, discount 20, gst 18% of 180 = 32.4, total 212.4
    
    // Subtotal = 100 + 200 = 300
    // Total Discount = 20 (item) + 50 (invoice) = 70
    // Total GST = 12 + 32.4 = 44.4
    // Final Total = (112 + 212.4) - 50 = 274.4

    expect(result.totals.subtotal).toBe(300);
    expect(result.totals.discountAmount).toBe(70);
    expect(result.totals.gstAmount).toBe(44.4);
    expect(result.totals.totalAmount).toBe(274.4);
  });
});
