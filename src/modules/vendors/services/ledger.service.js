import ledgerRepository from '../repositories/ledger.repository.js';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SupplierLedgerService {
  async recordEntry(tenantId, data, tx = prisma) {
    if (typeof ledgerRepository.getLastEntry !== 'function') {
      throw new Error('Ledger repository misconfigured');
    }
    const lastEntry = await ledgerRepository.getLastEntry(data.supplierId, tenantId, tx);
    const previousBalance = parseFloat(String(lastEntry?.balanceAfter || 0));

    let balanceAfter = previousBalance;
    if (data.debitAmount) {
      balanceAfter += parseFloat(String(data.debitAmount));
    }
    if (data.creditAmount) {
      balanceAfter -= parseFloat(String(data.creditAmount));
    }

    balanceAfter = Number(balanceAfter.toFixed(2));

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
        notes: data.notes || data.description,
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
