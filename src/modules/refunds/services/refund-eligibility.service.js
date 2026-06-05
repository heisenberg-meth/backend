class RefundEligibilityService {
  NON_RETURNABLE_TYPES = ['INSULIN', 'COLD_CHAIN', 'BIOLOGICAL', 'NARCOTIC', 'PSYCHOTROPIC'];
  CONTROLLED_SCHEDULES = ['X', 'H1'];

  getEligibilityMatrix() {
    return [
      { medicineType: 'sealed OTC', refundAllowed: true, requiresApproval: false },
      { medicineType: 'sealed prescription', refundAllowed: true, requiresApproval: false },
      { medicineType: 'opened OTC', refundAllowed: true, requiresApproval: true },
      { medicineType: 'opened prescription', refundAllowed: false, requiresApproval: false },
      { medicineType: 'opened insulin', refundAllowed: false, requiresApproval: false },
      { medicineType: 'cold-chain', refundAllowed: false, requiresApproval: false },
      { medicineType: 'Schedule X', refundAllowed: true, requiresApproval: true, restricted: true },
      {
        medicineType: 'Schedule H1',
        refundAllowed: true,
        requiresApproval: true,
        restricted: true,
      },
      { medicineType: 'expired', refundAllowed: false, requiresApproval: false },
    ];
  }

  validateInvoice(invoice) {
    if (!invoice) {
      return { eligible: false, reason: 'Invoice not found' };
    }
    if (invoice.deletedAt) {
      return { eligible: false, reason: 'Invoice has been deleted' };
    }
    if (invoice.status === 'CANCELLED') {
      return { eligible: false, reason: 'Invoice is cancelled' };
    }
    return { eligible: true };
  }

  validateReturnWindow(invoice) {
    const daysSincePurchase =
      (Date.now() - new Date(invoice.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePurchase > 30) {
      return {
        eligible: false,
        reason: `Return period expired (${Math.floor(daysSincePurchase)} days > 30 day limit)`,
      };
    }
    return { eligible: true, daysSincePurchase: Math.floor(daysSincePurchase) };
  }

  validateItemEligibility(item) {
    const medicine = item.medicine;
    if (!medicine) {
      return { eligible: false, reason: 'Medicine not found', requiresApproval: false };
    }

    const scheduleType = (medicine.scheduleType || '').toUpperCase();
    const storageCondition = (medicine.storageCondition || '').toUpperCase();
    const isReturned = item.returnedQuantity > 0;

    if (isReturned) {
      return { eligible: false, reason: 'Item has already been returned', requiresApproval: false };
    }

    if (this.CONTROLLED_SCHEDULES.includes(scheduleType)) {
      return { eligible: true, requiresApproval: true, restricted: true };
    }

    if (storageCondition === 'COLD_STORAGE' || storageCondition === 'REFRIGERATED') {
      return {
        eligible: false,
        reason: 'Cold-chain items are non-returnable',
        requiresApproval: false,
      };
    }

    if (scheduleType === 'X' || scheduleType === 'NARCOTIC' || scheduleType === 'PSYCHOTROPIC') {
      return { eligible: true, requiresApproval: true, restricted: true };
    }

    return { eligible: true, requiresApproval: false };
  }

  validateRefundQuantity(item, requestedQuantity) {
    if (requestedQuantity <= 0) {
      return { valid: false, reason: 'Refund quantity must be positive' };
    }
    if (requestedQuantity > item.quantity) {
      return {
        valid: false,
        reason: `Refund quantity (${requestedQuantity}) exceeds sold quantity (${item.quantity})`,
      };
    }
    return { valid: true };
  }

  checkDuplicateRefund(existingReturns, invoiceItemId) {
    const alreadyReturned = existingReturns.some((r) =>
      r.items.some((i) => i.invoiceItemId === invoiceItemId),
    );
    if (alreadyReturned) {
      return { duplicate: true, reason: 'Item has already been refunded' };
    }
    return { duplicate: false };
  }

  async determineApprovalRequired(items, totalAmount) {
    let requiresApproval = false;
    const reasons = [];

    for (const item of items) {
      if (item.requiresApproval) {
        requiresApproval = true;
        reasons.push(`Item requires approval: ${item.medicineName || item.invoiceItemId}`);
      }
    }

    const HIGH_VALUE_THRESHOLD = 10000;
    if (Number(totalAmount) > HIGH_VALUE_THRESHOLD) {
      requiresApproval = true;
      reasons.push(`High-value refund (₹${totalAmount} > ₹${HIGH_VALUE_THRESHOLD})`);
    }

    return { requiresApproval, reasons };
  }
}

export default new RefundEligibilityService();
