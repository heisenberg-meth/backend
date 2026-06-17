import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class SupplierCreditNoteService {
  async getCreditNotes(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [creditNotes, total] = await Promise.all([
      prisma.supplierCreditNote.findMany({
        where: { tenantId },
        include: {
          supplier: {
            select: { id: true, name: true, phone: true },
          },
          return: {
            select: { id: true, returnNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierCreditNote.count({ where: { tenantId } }),
    ]);

    return {
      creditNotes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getCreditNoteById(tenantId, id) {
    const creditNote = await prisma.supplierCreditNote.findUnique({
      where: { id },
      include: {
        supplier: true,
        return: true,
        usages: {
          include: {
            purchaseInvoice: {
              select: { invoiceNumber: true, invoiceDate: true },
            },
            user: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!creditNote || creditNote.tenantId !== tenantId) {
      throw new Error('Credit Note not found');
    }

    return creditNote;
  }

  async getSupplierCreditBalance(tenantId, supplierId) {
    const agg = await prisma.supplierCreditNote.aggregate({
      where: {
        tenantId,
        supplierId,
        status: { in: ['ISSUED', 'PARTIAL'] },
      },
      _sum: {
        remainingAmount: true,
      },
    });

    const availableCredit = Number(agg._sum.remainingAmount) || 0;

    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, outstandingBalance: true },
    });

    if (!supplier || supplier.tenantId !== tenantId) {
      throw new Error('Supplier not found');
    }

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      outstandingPayable: Number(supplier.outstandingBalance) || 0,
      availableCredit,
    };
  }

  async applyCreditNote(tenantId, creditNoteId, data, userId) {
    const { purchaseInvoiceId, amountToApply } = data;

    if (!purchaseInvoiceId) throw new Error('Purchase Invoice ID is required');
    if (!amountToApply || amountToApply <= 0)
      throw new Error('Amount to apply must be greater than 0');

    return await prisma.$transaction(async (tx) => {
      const creditNote = await tx.supplierCreditNote.findUnique({
        where: { id: creditNoteId },
      });

      if (!creditNote || creditNote.tenantId !== tenantId) {
        throw new Error('Credit Note not found');
      }

      if (creditNote.status === 'EXPIRED' || creditNote.status === 'VOIDED') {
        throw new Error(`Cannot apply credit note with status ${creditNote.status}`);
      }

      const available = Number(creditNote.remainingAmount);
      if (amountToApply > available) {
        throw new Error(`Amount to apply exceeds remaining credit note balance (${available})`);
      }

      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id: purchaseInvoiceId },
      });

      if (!invoice || invoice.tenantId !== tenantId) {
        throw new Error('Purchase invoice not found');
      }

      const invoiceBalance = Number(invoice.balanceAmount);
      if (amountToApply > invoiceBalance) {
        throw new Error(`Amount to apply exceeds invoice balance (${invoiceBalance})`);
      }

      // Create usage
      await tx.supplierCreditNoteUsage.create({
        data: {
          creditNoteId,
          purchaseInvoiceId,
          usedAmount: amountToApply,
          createdBy: userId,
        },
      });

      // Update credit note
      const newRemaining = available - amountToApply;
      const newStatus = newRemaining === 0 ? 'APPLIED' : creditNote.status;

      await tx.supplierCreditNote.update({
        where: { id: creditNoteId },
        data: {
          remainingAmount: newRemaining,
          status: newStatus,
        },
      });

      // Update Invoice
      const newInvoiceBalance = invoiceBalance - amountToApply;
      await tx.purchaseInvoice.update({
        where: { id: purchaseInvoiceId },
        data: {
          balanceAmount: newInvoiceBalance,
          paidAmount: Number(invoice.paidAmount) + amountToApply,
          paymentStatus: newInvoiceBalance <= 0 ? 'PAID' : 'PARTIALLY_PAID',
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'CREDIT_NOTE_APPLIED',
          target: 'SupplierCreditNote',
          type: 'INVENTORY',
        },
      });

      logger.info(
        `[CreditNote] Applied ${amountToApply} from CN ${creditNote.id} to Invoice ${invoice.id}`,
      );
      return { success: true };
    });
  }
}

export default new SupplierCreditNoteService();
