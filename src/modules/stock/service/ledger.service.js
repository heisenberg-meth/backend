import ledgerRepository from '../repositories/ledger.repository.js';

class LedgerService {
  async recordTransaction(data, tx) {
    return ledgerRepository.createTransaction(data, tx);
  }

  async getTransactionHistory(tenantId, medicineId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      ledgerRepository.findHistory(tenantId, medicineId, skip, limit),
      ledgerRepository.countHistory(tenantId, medicineId),
    ]);

    return { transactions, total, page, limit };
  }
}

export default new LedgerService();
