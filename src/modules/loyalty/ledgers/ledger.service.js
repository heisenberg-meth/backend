import prisma from '../../../config/prisma.js';

class LedgerService {
  /**
   * Create an immutable loyalty ledger entry
   */
  async recordLoyaltyTransaction(data, tx) {
    const client = tx || prisma;
    return await client.loyaltyTransaction.create({
      data: {
        tenantId: data.tenantId,
        patientId: data.patientId,
        type: data.type,
        points: data.points,
        runningBalance: data.runningBalance,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        notes: data.notes,
      },
    });
  }

  /**
   * Create an immutable credit ledger entry
   */
  async recordCreditTransaction(data, tx) {
    const client = tx || prisma;
    return await client.patientCreditLedger.create({
      data: {
        tenantId: data.tenantId,
        patientId: data.patientId,
        accountId: data.accountId,
        type: data.type,
        debit: data.debit || 0,
        credit: data.credit || 0,
        runningBalance: data.runningBalance,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        notes: data.notes,
        dueDate: data.dueDate,
      },
    });
  }
}

export default new LedgerService();
