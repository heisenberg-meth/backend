import prisma from '../../../config/prisma.js';

class SupplierReturnRepository {
  async findExpiredBatchesGroupedBySupplier(tenantId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        status: { in: ['EXPIRED', 'DAMAGED'] },
        deletedAt: null,
        supplierId: { not: null },
        quantity: { gt: 0 },
      },
      include: {
        medicine: { select: { id: true, name: true, genericName: true } },
        supplier: { select: { id: true, name: true, supplierCode: true } },
      },
      orderBy: [{ supplierId: 'asc' }, { expiryDate: 'asc' }],
    });

    const grouped = {};
    for (const batch of batches) {
      const sid = batch.supplierId;
      if (!grouped[sid]) {
        grouped[sid] = {
          supplier: batch.supplier,
          items: [],
          totalQty: 0,
          totalLoss: 0,
          itemCount: 0,
        };
      }
      grouped[sid].items.push(batch);
      grouped[sid].totalQty += batch.quantity;
      grouped[sid].totalLoss += Number(batch.purchasePrice) * batch.quantity;
      grouped[sid].itemCount++;
    }
    return Object.values(grouped);
  }

  async createReturn(data, items, userId) {
    const returnRecord = await prisma.supplierReturn.create({
      data: {
        tenantId: data.tenantId,
        supplierId: data.supplierId,
        returnNumber: data.returnNumber,
        status: 'DRAFT',
        createdBy: userId,
        notes: data.notes,
        items: {
          create: items.map((item) => ({
            medicineId: item.medicineId,
            batchId: item.batchId,
            quantity: item.quantity,
            expiryDate: item.expiryDate,
            purchasePrice: item.purchasePrice,
            lossAmount: item.lossAmount,
            reason: item.reason,
          })),
        },
      },
      include: {
        items: { include: { medicine: { select: { id: true, name: true } } } },
        supplier: { select: { id: true, name: true } },
      },
    });
    return returnRecord;
  }

  async findReturns(tenantId, { page = 1, limit = 20, status, supplierId }) {
    const where = { tenantId };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const skip = (page - 1) * limit;
    const [returns, total] = await Promise.all([
      prisma.supplierReturn.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          items: { include: { medicine: { select: { id: true, name: true } } } },
          creditNotes: { select: { id: true, creditNoteNumber: true, amount: true, status: true } },
          creator: { select: { id: true, fullName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierReturn.count({ where }),
    ]);

    return { returns, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findReturnById(id, tenantId) {
    return prisma.supplierReturn.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        items: {
          include: {
            medicine: { select: { id: true, name: true, genericName: true } },
            batch: { select: { id: true, batchNumber: true, expiryDate: true } },
          },
        },
        creditNotes: true,
        creator: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } },
      },
    });
  }

  async updateReturnStatus(id, tenantId, status, userId) {
    const updateData = { status };
    if (status === 'APPROVED') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = userId;
    }
    if (status === 'PICKED_UP') updateData.pickedUpAt = new Date();

    return prisma.supplierReturn.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async generateReturnNumber(tenantId) {
    const date = new Date();
    const year = date.getFullYear();
    const prefix = `RET-${year}-`;
    const lastReturn = await prisma.supplierReturn.findFirst({
      where: { tenantId, returnNumber: { startsWith: prefix } },
      orderBy: { returnNumber: 'desc' },
      select: { returnNumber: true },
    });

    let nextSeq = 1;
    if (lastReturn) {
      const parts = lastReturn.returnNumber.split('-');
      nextSeq = parseInt(parts[2] || '0', 10) + 1;
    }
    return `${prefix}${String(nextSeq).padStart(5, '0')}`;
  }

  async createCreditNote(returnId, data) {
    const returnRecord = await prisma.supplierReturn.findUnique({
      where: { id: returnId },
      select: { tenantId: true, supplierId: true, returnAmount: true },
    });
    if (!returnRecord) throw new Error('Return not found');

    const date = new Date();
    const prefix = `CN-${date.getFullYear()}-`;
    const lastNote = await prisma.supplierCreditNote.findFirst({
      where: { tenantId: returnRecord.tenantId, creditNoteNumber: { startsWith: prefix } },
      orderBy: { creditNoteNumber: 'desc' },
      select: { creditNoteNumber: true },
    });
    let nextSeq = 1;
    if (lastNote) {
      const parts = lastNote.creditNoteNumber.split('-');
      nextSeq = parseInt(parts[2] || '0', 10) + 1;
    }
    const creditNoteNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;

    return prisma.supplierCreditNote.create({
      data: {
        tenantId: returnRecord.tenantId,
        supplierId: returnRecord.supplierId,
        returnId,
        creditNoteNumber,
        amount: data.amount || returnRecord.returnAmount || 0,
        notes: data.notes,
      },
      include: {
        return: { select: { id: true, returnNumber: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async findCreditNotes(tenantId, { page = 1, limit = 20, supplierId, status }) {
    const where = { tenantId };
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;

    const skip = (page - 1) * limit;
    const [notes, total] = await Promise.all([
      prisma.supplierCreditNote.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          return: { select: { id: true, returnNumber: true } },
        },
        orderBy: { issuedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierCreditNote.count({ where }),
    ]);

    return { notes, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSupplierInwardTransactions(supplierId, tenantId, { page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = { tenantId, supplierId, deletedAt: null };

    const [batches, total] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where,
        include: {
          medicine: { select: { id: true, name: true } },
          purchaseInvoice: { select: { id: true, invoiceNumber: true, invoiceDate: true } },
          purchaseOrderItem: { select: { purchaseOrder: { select: { orderNumber: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.inventoryBatch.count({ where }),
    ]);

    return { transactions: batches, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSupplierReturnTransactions(supplierId, tenantId, { page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = { tenantId, supplierId };

    const [returns, total] = await Promise.all([
      prisma.supplierReturn.findMany({
        where,
        include: {
          items: {
            include: { medicine: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierReturn.count({ where }),
    ]);

    return { returns, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getSupplierLedger(supplierId, tenantId, { page = 1, limit = 20 }) {
    const skip = (page - 1) * limit;
    const where = { tenantId, supplierId };

    const [entries, total] = await Promise.all([
      prisma.supplierLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supplierLedger.count({ where }),
    ]);

    const summary = await prisma.supplierLedger.aggregate({
      where: { tenantId, supplierId },
      _sum: { debitAmount: true, creditAmount: true },
    });

    return {
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalDebit: summary._sum.debitAmount || 0,
        totalCredit: summary._sum.creditAmount || 0,
        balance: Number(summary._sum.debitAmount || 0) - Number(summary._sum.creditAmount || 0),
      },
    };
  }

  async recordLedgerEntry(tenantId, supplierId, type, amount, refType, refId, notes, prismaClient) {
    const client = prismaClient || prisma;
    const lastEntry = await client.supplierLedger.findFirst({
      where: { tenantId, supplierId },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    const prevBalance = Number(lastEntry?.balanceAfter || 0);

    const debitAmount = type === 'DEBIT' ? amount : 0;
    const creditAmount = type === 'CREDIT' ? amount : 0;
    const balanceAfter = prevBalance + Number(debitAmount) - Number(creditAmount);

    return client.supplierLedger.create({
      data: {
        tenantId,
        supplierId,
        type,
        referenceType: refType,
        referenceId: refId,
        debitAmount,
        creditAmount,
        balanceAfter,
        notes,
      },
    });
  }
}

export default new SupplierReturnRepository();
