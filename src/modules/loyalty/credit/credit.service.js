import creditRepository from '../repositories/credit.repository.js';

class CreditService {
  async getCreditAccount(patientId, tenantId) {
    let account = await creditRepository.findByPatientId(patientId, tenantId);

    if (!account) {
      account = await creditRepository.createAccount({
        tenantId,
        patientId,
      });
    }

    return account;
  }

  async addCreditTransaction(patientId, tenantId, amount, invoiceId, dueDate, tx) {
    const account = await this.getCreditAccount(patientId, tenantId);

    if (account.accountStatus === 'BLOCKED') {
      throw new Error('Credit account is blocked');
    }

    const newBalance = Number(account.outstandingBalance) + Number(amount);

    if (newBalance > Number(account.creditLimit)) {
      throw new Error('Credit limit exceeded');
    }

    await creditRepository.updateBalance(patientId, tenantId, newBalance, tx);

    await creditRepository.createLedgerEntry(
      {
        tenantId,
        accountId: account.id,
        patientId,
        invoiceId,
        debit: amount,
        runningBalance: newBalance,
        dueDate: dueDate ? new Date(dueDate) : null,
        notes: `Credit purchase for invoice ${invoiceId}`,
      },
      tx,
    );
  }

  async makePayment(patientId, tenantId, amount, notes, tx) {
    const account = await this.getCreditAccount(patientId, tenantId);

    const newBalance = Number(account.outstandingBalance) - Number(amount);

    await creditRepository.updateBalance(patientId, tenantId, newBalance, tx);

    await creditRepository.createLedgerEntry(
      {
        tenantId,
        accountId: account.id,
        patientId,
        credit: amount,
        runningBalance: newBalance,
        notes: notes || 'Credit payment',
      },
      tx,
    );

    // If balance is now within limits, maybe unblock?
    if (newBalance <= Number(account.creditLimit) && account.accountStatus === 'OVERDUE') {
      await creditRepository.updateStatus(patientId, tenantId, 'ACTIVE');
    }
  }

  async getLedger(patientId, tenantId) {
    return creditRepository.getLedger(patientId, tenantId);
  }
}

export default new CreditService();
