class LedgerRepository {
  async getLastEntry(supplierId, tenantId, tx) {
    return tx.supplierLedger.findFirst({
      where: {
        supplierId,
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async createEntry(data, tx) {
    return tx.supplierLedger.create({
      data,
    });
  }
}

export default new LedgerRepository();
