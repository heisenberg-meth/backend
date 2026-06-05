import ledgerRepository from '../repositories/ledger.repository.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SupplierLedgerService {
  async recordEntry(tenantId, data, tx = prisma) {
    const lastEntry = await ledgerRepository.getLastEntry(data.supplierId, tenantId, tx);
    const previousBalance = lastEntry?.balanceAfter || 0;

    let balanceAfter = previousBalance;
    if (data.debitAmount) {
      balanceAfter += data.debitAmount;
    }
    if (data.creditAmount) {
      balanceAfter -= data.creditAmount;
    }

    const entry = await ledgerRepository.createEntry(
      {
        tenantId,
        supplierId: data.supplierId,
        type: data.type,
        debitAmount: data.debitAmount || 0,
        creditAmount: data.creditAmount || 0,
        balanceAfter,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        description: data.description,
        createdBy: data.createdBy,
      },
      tx,
    );

    logger.info(
      `[Ledger] Recorded entry for supplier ${data.supplierId}: type=${data.type}, balance=${balanceAfter}`,
    );
    return entry;
  }
}

export default new SupplierLedgerService();
