import prisma from '../../../../config/prisma.js';
import { DOMAIN_EVENTS } from '../../../../shared/constants/events.js';
import { emitLocalEvent } from '../../../../shared/events/local-event-bus.js';

class LedgerService {
  /**
   * Create a new ledger entry with running balance calculation
   */
  async createEntry(
    tx,
    {
      tenantId,
      supplierId,
      type,
      referenceType,
      referenceId,
      debitAmount = 0,
      creditAmount = 0,
      notes = '',
    },
  ) {
    // 1. Get last entry for running balance
    const lastEntry = await tx.supplierLedger.findFirst({
      where: { supplierId, tenantId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });

    const previousBalance = Number(lastEntry?.balanceAfter || 0);

    // In Accounts Payable Ledger (Money you owe):
    // Debit increases what you owe (e.g. Purchase Invoice)
    // Credit decreases what you owe (e.g. Payment)
    // Wait, typically AP is a Liability.
    // Credit increases liability, Debit decreases liability.
    // User logic: Invoice = Debit increases, Payment = Credit increases.
    // Balance = Prev + Debit - Credit.
    // This means Debit is "Amount Owed" and Credit is "Amount Paid".

    const balanceAfter = previousBalance + Number(debitAmount) - Number(creditAmount);

    const entry = await tx.supplierLedger.create({
      data: {
        tenantId,
        supplierId,
        type,
        referenceType,
        referenceId,
        debitAmount,
        creditAmount,
        balanceAfter,
        notes,
      },
    });

    // Emit event for real-time updates/analytics
    emitLocalEvent(DOMAIN_EVENTS.SUPPLIER_LEDGER_UPDATED, {
      supplierId,
      tenantId,
      entryId: entry.id,
    });

    return entry;
  }

  async getLedger(tenantId, supplierId, { from, to, type, page = 1, limit = 50 }) {
    const skip = (page - 1) * limit;
    const where = {
      tenantId,
      supplierId,
      ...(type && { type }),
      ...((from || to) && {
        createdAt: {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        },
      }),
    };

    const [entries, total, summary] = await Promise.all([
      prisma.supplierLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierLedger.count({ where }),
      prisma.supplierLedger.aggregate({
        where: { tenantId, supplierId },
        _sum: { debitAmount: true, creditAmount: true },
      }),
    ]);

    // Get current balance from last entry
    const lastEntry = await prisma.supplierLedger.findFirst({
      where: { tenantId, supplierId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });

    return {
      supplierId,
      currentBalance: lastEntry?.balanceAfter || 0,
      totalDebit: summary._sum.debitAmount || 0,
      totalCredit: summary._sum.creditAmount || 0,
      entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export default new LedgerService();
