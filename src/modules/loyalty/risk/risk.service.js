import prisma from '../../../config/prisma.js';
import { Decimal } from '@prisma/client/runtime/library';

class RiskEngine {
  /**
   * Check if a patient's credit should be blocked
   */
  async assessCreditRisk(patientId) {
    const account = await prisma.patientCreditAccount.findUnique({
      where: { patientId },
      include: {
        ledgerEntries: {
          where: {
            type: 'CREDIT_ISSUED',
            dueDate: { lt: new Date() },
            runningBalance: { gt: 0 },
          },
        },
      },
    });

    if (!account) return { blocked: false };

    // Rule 1: Overdue more than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const criticallyOverdue = account.ledgerEntries.some(entry => entry.dueDate && entry.dueDate < ninetyDaysAgo);

    if (criticallyOverdue) {
      await prisma.patientCreditAccount.update({
        where: { id: account.id },
        data: { accountStatus: 'BLOCKED' },
      });
      return { blocked: true, reason: 'CRITICALLY_OVERDUE' };
    }

    // Rule 2: Exceeding credit limit
    if (new Decimal(account.outstandingBalance).gt(account.creditLimit)) {
      return { blocked: true, reason: 'LIMIT_EXCEEDED' };
    }

    return { blocked: account.accountStatus === 'BLOCKED' };
  }
}

export default new RiskEngine();
