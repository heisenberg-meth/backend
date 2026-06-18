import prisma from '../../../config/prisma.js';

class SupplierReturnRepository {
  async findExpiredBatchesGroupedBySupplier(tenantId) {
    const batches = await prisma.inventoryBatch.findMany({
      where: {
        tenantId,
        OR: [{ expiryDate: { lt: new Date() } }, { status: 'EXPIRED' }, { status: 'DAMAGED' }],
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

  async createReturn(data, items, userId, tx) {
    const client = tx || prisma;
    const totalAmount = items.reduce((sum, item) => sum + Number(item.lossAmount || 0), 0);
    const returnRecord = await client.supplierReturn.create({
      data: {
        tenantId: data.tenantId,
        supplierId: data.supplierId,
        returnNumber: data.returnNumber,
        status: 'DRAFT',
        createdBy: userId,
        notes: data.notes,
        returnAmount: totalAmount,
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
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const isUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const validStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'PICKED_UP', 'COMPLETED', 'REJECTED'];
    const statusVal = status && validStatuses.includes(status.toUpperCase()) ? status.toUpperCase() : undefined;
    const supplierIdVal = supplierId && isUuid(supplierId) ? String(supplierId) : undefined;

    const where = { tenantId };
    if (statusVal) where.status = statusVal;
    if (supplierIdVal) where.supplierId = supplierIdVal;

    const skip = (pageNum - 1) * limitNum;
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
        take: limitNum,
      }),
      prisma.supplierReturn.count({ where }),
    ]);

    return {
      returns,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  async findReturnById(id, tenantId) {
    return prisma.supplierReturn.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        items: {
          include: {
            medicine: { select: { id: true, name: true, genericName: true } },
            batch: { select: { id: true, batchNumber: true, expiryDate: true, branchId: true } },
          },
        },
        creditNotes: true,
        creator: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } },
      },
    });
  }

  async updateReturnStatus(id, tenantId, status, userId, tx) {
    const client = tx || prisma;
    const updateData = { status };
    if (status === 'APPROVED') {
      updateData.approvedAt = new Date();
      updateData.approvedBy = userId;
    }
    if (status === 'PICKED_UP') updateData.pickedUpAt = new Date();

    return client.supplierReturn.update({
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

  async createCreditNote(returnId, data, tx) {
    const client = tx || prisma;
    const returnRecord = await client.supplierReturn.findUnique({
      where: { id: returnId },
      select: { tenantId: true, supplierId: true, returnAmount: true },
    });
    if (!returnRecord) throw new Error('Return not found');

    const date = new Date();
    const prefix = `CN-${date.getFullYear()}-`;
    const lastNote = await client.supplierCreditNote.findFirst({
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

    return client.supplierCreditNote.create({
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
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const isUuid = (val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const validStatuses = ['DRAFT', 'PENDING', 'APPROVED', 'PICKED_UP', 'COMPLETED', 'REJECTED'];
    const statusVal = status && validStatuses.includes(status.toUpperCase()) ? status.toUpperCase() : undefined;
    const supplierIdVal = supplierId && isUuid(supplierId) ? String(supplierId) : undefined;

    const where = { tenantId };
    if (supplierIdVal) where.supplierId = supplierIdVal;
    if (statusVal) where.status = statusVal;

    const skip = (pageNum - 1) * limitNum;
    const [notes, total] = await Promise.all([
      prisma.supplierCreditNote.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          return: { select: { id: true, returnNumber: true } },
        },
        orderBy: { issuedAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.supplierCreditNote.count({ where }),
    ]);

    return {
      notes,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  async getSupplierInwardTransactions(supplierId, tenantId, { page = 1, limit = 20 }) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;
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
        take: limitNum,
      }),
      prisma.inventoryBatch.count({ where }),
    ]);

    return {
      transactions: batches,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  async getSupplierReturnTransactions(supplierId, tenantId, { page = 1, limit = 20 }) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;
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
        take: limitNum,
      }),
      prisma.supplierReturn.count({ where }),
    ]);

    return {
      returns,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  async getSupplierLedger(supplierId, tenantId, { page = 1, limit = 20 }) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;
    const where = { tenantId, supplierId };

    const [entries, total] = await Promise.all([
      prisma.supplierLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
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
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
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
    const prevBalance = parseFloat(String(lastEntry?.balanceAfter || 0));

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
