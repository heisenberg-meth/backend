import prisma from '../../../config/prisma.js';
import ledgerService from '../ledgers/ledger.service.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import analyticsService from '../analytics/analytics.service.js';
import { Decimal } from '@prisma/client/runtime/library';

class CreditService {
  async getAccount(patientId, tenantId) {
    let account = await prisma.patientCreditAccount.findUnique({
      where: { patientId },
    });
    if (!account) {
      account = await prisma.patientCreditAccount.create({
        data: {
          tenantId,
          patientId,
          creditLimit: 5000,
          outstandingBalance: 0,
          accountStatus: 'ACTIVE',
        },
      });
    }
    return account;
  }

  async issueCredit(tenantId, patientId, amount, referenceId = null, notes = '', dueDate = null, tx) {
    const client = tx || prisma;

    return await client.$transaction(async (ctx) => {
      const account = await this.getAccount(patientId, tenantId);

      if (account.accountStatus === 'BLOCKED') {
        throw new Error('Credit account is blocked');
      }

      const newBalance = new Decimal(account.outstandingBalance).add(amount);

      if (newBalance.gt(account.creditLimit)) {
        throw new Error('Credit limit exceeded');
      }

      await ledgerService.recordCreditTransaction({
        tenantId,
        patientId,
        accountId: account.id,
        type: 'CREDIT_ISSUED',
        debit: amount,
        runningBalance: newBalance,
        referenceType: referenceId ? 'INVOICE' : 'MANUAL',
        referenceId,
        notes,
        dueDate,
      }, ctx);

      await ctx.patientCreditAccount.update({
        where: { id: account.id },
        data: { outstandingBalance: newBalance },
      });

      eventBus.emit('CREDIT_ISSUED', { tenantId, patientId, amount, newBalance });

      return { amount, newBalance };
    });
  }

  async recordPayment(tenantId, patientId, amount, notes = '', tx) {
    const client = tx || prisma;

    return await client.$transaction(async (ctx) => {
      const account = await this.getAccount(patientId, tenantId);

      const newBalance = new Decimal(account.outstandingBalance).sub(amount);

      await ledgerService.recordCreditTransaction({
        tenantId,
        patientId,
        accountId: account.id,
        type: 'PAYMENT_RECEIVED',
        credit: amount,
        runningBalance: newBalance,
        referenceType: 'PAYMENT',
        notes,
      }, ctx);

      await ctx.patientCreditAccount.update({
        where: { id: account.id },
        data: {
          outstandingBalance: newBalance,
          accountStatus: newBalance.lte(account.creditLimit) ? 'ACTIVE' : account.accountStatus,
        },
      });

      eventBus.emit('CREDIT_PAYMENT_RECEIVED', { tenantId, patientId, amount, newBalance });

      return { amount, newBalance };
    });
  }

  async getLedger(patientId) {
    return await prisma.patientCreditLedger.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAnalytics(tenantId) {
    return await analyticsService.getCreditRiskAnalytics(tenantId);
  }
}

export default new CreditService();
