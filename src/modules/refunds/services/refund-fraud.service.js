class RefundFraudService {
  FRAUD_THRESHOLDS = {
    MAX_REFUNDS_PER_DAY: 3,
    MAX_REFUND_AMOUNT_PER_MONTH: 50000,
    MAX_REFUND_RATE: 0.3,
    REPEATED_SAME_ITEM_WINDOW_DAYS: 30,
    HIGH_VALUE_SINGLE_REFUND: 20000,
  };

  async evaluateRefund(tenantId, patientId, items, totalAmount, existingReturns) {
    let fraudScore = 0;
    const flags = [];

    const repeatedRefundCheck = this.checkRepeatedRefunds(existingReturns);
    if (repeatedRefundCheck.flag) {
      fraudScore += repeatedRefundCheck.score;
      flags.push(repeatedRefundCheck.flag);
    }

    const duplicateItemCheck = this.checkDuplicateItems(items, existingReturns);
    if (duplicateItemCheck.flag) {
      fraudScore += duplicateItemCheck.score;
      flags.push(duplicateItemCheck.flag);
    }

    const highValueCheck = this.checkHighValue(totalAmount);
    if (highValueCheck.flag) {
      fraudScore += highValueCheck.score;
      flags.push(highValueCheck.flag);
    }

    const suspiciousItemsCheck = this.checkSuspiciousItems(items);
    if (suspiciousItemsCheck.flag) {
      fraudScore += suspiciousItemsCheck.score;
      flags.push(suspiciousItemsCheck.flag);
    }

    fraudScore = Math.min(fraudScore, 100);

    return {
      fraudScore,
      fraudFlags: flags,
      requiresReview: fraudScore >= 50,
      isBlocked: fraudScore >= 80,
    };
  }

  checkRepeatedRefunds(existingReturns) {
    const recentCount = existingReturns.length;
    if (recentCount >= this.FRAUD_THRESHOLDS.MAX_REFUNDS_PER_DAY) {
      return { flag: `Repeated refunds: ${recentCount} in period`, score: 30 };
    }
    if (recentCount >= 2) {
      return { flag: `Multiple refunds: ${recentCount} in period`, score: 15 };
    }
    return { flag: null, score: 0 };
  }

  checkDuplicateItems(requestedItems, existingReturns) {
    for (const item of requestedItems) {
      const alreadyReturned = existingReturns.some((r) =>
        r.items.some((i) => i.invoiceItemId === item.invoiceItemId),
      );
      if (alreadyReturned) {
        return { flag: `Duplicate refund attempt for item ${item.invoiceItemId}`, score: 40 };
      }
    }
    return { flag: null, score: 0 };
  }

  checkHighValue(totalAmount) {
    if (Number(totalAmount) >= this.FRAUD_THRESHOLDS.HIGH_VALUE_SINGLE_REFUND) {
      return { flag: `High-value refund: ₹${totalAmount}`, score: 25 };
    }
    return { flag: null, score: 0 };
  }

  checkSuspiciousItems(items) {
    const hasControlledItems = items.some((i) => {
      const schedule = (i.medicine?.scheduleType || '').toUpperCase();
      return ['X', 'H1'].includes(schedule);
    });
    if (hasControlledItems) {
      return { flag: 'Refund includes controlled substances', score: 20 };
    }
    return { flag: null, score: 0 };
  }

  async checkPatientFrequency(patientRefunds) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentRefunds = patientRefunds.filter(
      (r) => new Date(r.createdAt).getTime() > thirtyDaysAgo,
    );

    if (recentRefunds.length >= this.FRAUD_THRESHOLDS.MAX_REFUNDS_PER_DAY) {
      return { flag: `Patient initiated ${recentRefunds.length} refunds in 30 days`, score: 35 };
    }
    return { flag: null, score: 0 };
  }
}

export default new RefundFraudService();
