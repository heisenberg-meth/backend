import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

const FRAUD_RULES = {
  HIGH_RETURN_VELOCITY: {
    description: 'User has created excessive returns in short period',
    threshold: 5,
    windowHours: 24,
    score: 30,
  },
  LARGE_RETURN_AMOUNT: {
    description: 'Return amount exceeds threshold',
    threshold: 10000,
    score: 25,
  },
  HIGH_RETURN_RATIO: {
    description: 'User has high return-to-sales ratio',
    threshold: 0.3,
    windowDays: 30,
    score: 35,
  },
  REPEATED_ITEM_RETURN: {
    description: 'Same medicine returned multiple times',
    threshold: 3,
    windowDays: 7,
    score: 20,
  },
  AFTER_HOURS_RETURN: {
    description: 'Return processed outside business hours',
    score: 15,
  },
  CASHIER_EXCESSIVE_RETURNS: {
    description: 'Cashier processing abnormal return volume',
    threshold: 10,
    windowDays: 7,
    score: 40,
  },
};

class FraudDetectionService {
  async analyzeReturn(tenantId, userId, returnData) {
    const flags = [];
    let totalScore = 0;

    const velocityCheck = await this.checkReturnVelocity(tenantId, userId);
    if (velocityCheck.triggered) {
      flags.push('HIGH_RETURN_VELOCITY');
      totalScore += FRAUD_RULES.HIGH_RETURN_VELOCITY.score;
    }

    if (returnData.items && returnData.items.length > 0) {
      const amountCheck = await this.checkReturnAmount(returnData);
      if (amountCheck.triggered) {
        flags.push('LARGE_RETURN_AMOUNT');
        totalScore += FRAUD_RULES.LARGE_RETURN_AMOUNT.score;
      }
    }

    const ratioCheck = await this.checkReturnRatio(tenantId, userId);
    if (ratioCheck.triggered) {
      flags.push('HIGH_RETURN_RATIO');
      totalScore += FRAUD_RULES.HIGH_RETURN_RATIO.score;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (user?.role === 'CASHIER') {
      const cashierCheck = await this.checkCashierReturns(tenantId, userId);
      if (cashierCheck.triggered) {
        flags.push('CASHIER_EXCESSIVE_RETURNS');
        totalScore += FRAUD_RULES.CASHIER_EXCESSIVE_RETURNS.score;
      }
    }

    const hour = new Date().getHours();
    if (hour < 8 || hour > 20) {
      flags.push('AFTER_HOURS_RETURN');
      totalScore += FRAUD_RULES.AFTER_HOURS_RETURN.score;
    }

    const riskLevel = this.calculateRiskLevel(totalScore);

    if (flags.length > 0) {
      await this.logFraudAlert(tenantId, userId, returnData.invoiceId, flags, totalScore);
    }

    return {
      score: totalScore,
      flags,
      riskLevel,
      approvalRequired: totalScore >= 30,
    };
  }

  async checkReturnVelocity(tenantId, userId) {
    const recentReturns = await prisma.return.count({
      where: {
        tenantId,
        createdBy: userId,
        createdAt: {
          gte: new Date(Date.now() - FRAUD_RULES.HIGH_RETURN_VELOCITY.windowHours * 60 * 60 * 1000),
        },
      },
    });

    return {
      triggered: recentReturns >= FRAUD_RULES.HIGH_RETURN_VELOCITY.threshold,
      count: recentReturns,
    };
  }

  async checkReturnAmount(returnData) {
    let totalAmount = 0;

    if (returnData.items && returnData.invoiceItems) {
      returnData.items.forEach((item) => {
        const invoiceItem = returnData.invoiceItems.find((ii) => ii.id === item.invoiceItemId);
        if (invoiceItem) {
          totalAmount += invoiceItem.unitPrice * item.quantity;
        }
      });
    }

    return {
      triggered: totalAmount >= FRAUD_RULES.LARGE_RETURN_AMOUNT.threshold,
      amount: totalAmount,
    };
  }

  async checkReturnRatio(tenantId, userId) {
    const thirtyDaysAgo = new Date(
      Date.now() - FRAUD_RULES.HIGH_RETURN_RATIO.windowDays * 24 * 60 * 60 * 1000,
    );

    const [returns, sales] = await Promise.all([
      prisma.return.count({
        where: {
          tenantId,
          createdBy: userId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.invoice.count({
        where: {
          tenantId,
          createdBy: userId,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    if (sales === 0) return { triggered: false, ratio: 0 };

    const ratio = returns / sales;

    return {
      triggered: ratio >= FRAUD_RULES.HIGH_RETURN_RATIO.threshold,
      ratio,
      returns,
      sales,
    };
  }

  async checkCashierReturns(tenantId, userId) {
    const recentReturns = await prisma.return.count({
      where: {
        tenantId,
        createdBy: userId,
        createdAt: {
          gte: new Date(
            Date.now() - FRAUD_RULES.CASHIER_EXCESSIVE_RETURNS.windowDays * 24 * 60 * 60 * 1000,
          ),
        },
      },
    });

    return {
      triggered: recentReturns >= FRAUD_RULES.CASHIER_EXCESSIVE_RETURNS.threshold,
      count: recentReturns,
    };
  }

  calculateRiskLevel(score) {
    if (score >= 50) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    if (score >= 15) return 'LOW';
    return 'MINIMAL';
  }

  async logFraudAlert(tenantId, userId, invoiceId, flags, score) {
    await prisma.salesAnomaly.create({
      data: {
        tenantId,
        invoiceId: invoiceId || '',
        anomalyType: 'RETURN_FRAUD',
        riskScore: score,
        description: `Fraud flags: ${flags.join(', ')}`,
        status: 'FLAGGED',
      },
    });

    logger.warn(
      `[FraudDetection] Return fraud alert: userId=${userId}, flags=${flags.join(',')}, score=${score}`,
    );
  }

  async getFraudStats(tenantId) {
    const [totalAlerts, highRisk, byType] = await Promise.all([
      prisma.salesAnomaly.count({
        where: { tenantId, anomalyType: 'RETURN_FRAUD' },
      }),
      prisma.salesAnomaly.count({
        where: { tenantId, anomalyType: 'RETURN_FRAUD', riskScore: { gte: 50 } },
      }),
      prisma.salesAnomaly.groupBy({
        by: ['description'],
        where: { tenantId, anomalyType: 'RETURN_FRAUD' },
        _count: true,
        _avg: { riskScore: true },
      }),
    ]);

    return {
      totalAlerts,
      highRisk,
      byType,
    };
  }
}

export default new FraudDetectionService();
