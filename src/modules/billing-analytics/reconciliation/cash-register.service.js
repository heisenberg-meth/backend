import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class CashRegisterService {
  /**
   * Open a new cash register session for a cashier
   */
  async openSession(tenantId, branchId, cashierId, openingCash, notes) {
    // Check for existing open session
    const existing = await prisma.cashRegisterSession.findFirst({
      where: {
        tenantId,
        cashierId,
        status: 'OPEN'
      }
    });

    if (existing) {
      throw new Error('You already have an open cash register session. Close it before opening a new one.');
    }

    return await prisma.cashRegisterSession.create({
      data: {
        tenantId,
        branchId,
        cashierId,
        openingCash,
        notes,
        status: 'OPEN',
        openedAt: new Date(),
      },
    });
  }

  /**
   * Close and reconcile a cash register session
   */
  async closeSession(tenantId, sessionId, actualClosingCash, notes) {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.cashRegisterSession.findUnique({
        where: { id: sessionId }
      });

      if (!session || session.tenantId !== tenantId) {
        throw new Error('Session not found');
      }

      if (session.status !== 'OPEN') {
        throw new Error('Session is already closed');
      }

      // Calculate expected cash based on transactions during session
      const transactions = await tx.payment.findMany({
        where: {
          tenantId,
          branchId: session.branchId,
          paymentMethod: 'CASH',
          status: 'SUCCESS',
          paidAt: {
            gte: session.openedAt,
            lte: new Date()
          }
        }
      });

      const cashSales = transactions.reduce((sum, p) => sum + (p.amount > 0 ? p.amount : 0), 0);
      const cashRefunds = transactions.reduce((sum, p) => sum + (p.amount < 0 ? Math.abs(p.amount) : 0), 0);
      
      const expectedClosingCash = session.openingCash + cashSales - cashRefunds;
      const variance = actualClosingCash - expectedClosingCash;

      const updated = await tx.cashRegisterSession.update({
        where: { id: sessionId },
        data: {
          closingCash: actualClosingCash,
          expectedClosingCash,
          cashSales,
          cashRefunds,
          variance,
          status: 'CLOSED',
          closedAt: new Date(),
          notes: notes || session.notes
        }
      });

      logger.info({ sessionId, variance, tenantId }, 'Cash register session closed and reconciled');

      // Trigger alert if variance is high
      if (Math.abs(variance) > 100) { // Configurable threshold
        logger.warn({ sessionId, variance }, 'Significant cash variance detected!');
        // await alertService.notify('CASH_VARIANCE', { sessionId, variance });
      }

      return updated;
    });
  }

  /**
   * Get current active session for a cashier
   */
  async getActiveSession(tenantId, cashierId) {
    return await prisma.cashRegisterSession.findFirst({
      where: {
        tenantId,
        cashierId,
        status: 'OPEN'
      }
    });
  }

  /**
   * Get session history with filters
   */
  async getSessionHistory(tenantId, branchId, from, to) {
    return await prisma.cashRegisterSession.findMany({
      where: {
        tenantId,
        branchId: branchId || undefined,
        openedAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined
        }
      },
      include: {
        cashier: {
          select: { fullName: true, email: true }
        }
      },
      orderBy: { openedAt: 'desc' }
    });
  }
}

export default new CashRegisterService();
