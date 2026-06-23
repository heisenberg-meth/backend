import prisma from '../../config/prisma.js';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';

const toNumber = (value) => Number(value || 0);

async function audit(tenantId, userId, action, target, type = 'FINANCIAL') {
  try {
    await prisma.auditLog.create({ data: { tenantId, userId, action, target, type } });
  } catch {
    // Audit should not hide the primary operation result.
  }
}

async function getLastSupplierBalance(tx, tenantId, supplierId) {
  const lastEntry = await tx.supplierLedger.findFirst({
    where: { tenantId, supplierId },
    orderBy: { createdAt: 'desc' },
    select: { balanceAfter: true },
  });
  return toNumber(lastEntry?.balanceAfter);
}

async function applyInvoicePayment(tx, tenantId, invoiceId, amount) {
  const invoice = await tx.purchaseInvoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!invoice) throw new Error(`Purchase invoice ${invoiceId} not found`);
  const paidAmount = toNumber(invoice.paidAmount) + amount;
  const balanceAmount = Math.max(0, toNumber(invoice.totalAmount) - paidAmount);
  const paymentStatus = balanceAmount <= 0 ? 'PAID' : 'PARTIALLY_PAID';
  return tx.purchaseInvoice.update({
    where: { id: invoice.id },
    data: {
      paidAmount,
      balanceAmount,
      paymentStatus,
      paidAt: balanceAmount <= 0 ? new Date() : invoice.paidAt,
    },
  });
}

async function procurementProductionRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/grns', {
    schema: { tags: ['GRN'], summary: 'List goods receipt notes' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const grns = await prisma.goodsReceiptNote.findMany({
      where: { tenantId: request.tenantId },
      include: {
        purchaseOrder: { select: { id: true, orderNumber: true, supplierId: true } },
        items: { include: { medicine: { select: { id: true, name: true } } } },
      },
      orderBy: { receivedDate: 'desc' },
    });
    return reply.send({ success: true, data: grns });
  });

  fastify.get('/grns/:id', {
    schema: { tags: ['GRN'], summary: 'Get goods receipt note detail' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const grn = await prisma.goodsReceiptNote.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
      include: {
        purchaseOrder: { include: { supplier: { select: { id: true, name: true } } } },
        items: { include: { medicine: { select: { id: true, name: true } } } },
      },
    });
    if (!grn) return reply.code(404).send({ success: false, message: 'GRN not found' });
    return reply.send({ success: true, data: grn });
  });

  fastify.get('/grns/:id/pdf', {
    schema: { tags: ['GRN'], summary: 'Print goods receipt note' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const grn = await prisma.goodsReceiptNote.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
      include: { items: { include: { medicine: { select: { name: true } } } }, purchaseOrder: true },
    });
    if (!grn) return reply.code(404).send({ success: false, message: 'GRN not found' });
    const rows = grn.items.map((item) => `<tr><td>${item.medicine?.name || item.medicineId}</td><td>${item.batchNumber || ''}</td><td>${item.receivedQuantity}</td><td>${item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-IN') : ''}</td></tr>`).join('');
    return reply.type('text/html').send(`<!doctype html><html><body><h1>GRN ${grn.grnNumber}</h1><p>PO: ${grn.purchaseOrder?.orderNumber || ''}</p><table border="1" cellspacing="0" cellpadding="6"><tr><th>Medicine</th><th>Batch</th><th>Qty</th><th>Expiry</th></tr>${rows}</table></body></html>`);
  });

  fastify.post('/grns/:id/reverse', {
    schema: { tags: ['GRN'], summary: 'Reverse a goods receipt note' },
    preHandler: [requirePermission('purchase-orders.receive')],
  }, async (request, reply) => {
    const result = await prisma.$transaction(async (tx) => {
      const grn = await tx.goodsReceiptNote.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
        include: { items: true, purchaseOrder: true },
      });
      if (!grn) throw new Error('GRN not found');
      if (grn.reversedAt) throw new Error('GRN already reversed');

      let reversalAmount = 0;
      for (const item of grn.items) {
        const batch = await tx.inventoryBatch.findFirst({
          where: {
            tenantId: request.tenantId,
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            purchaseOrderItemId: item.purchaseOrderItemId,
          },
        });
        if (batch) {
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              quantity: { decrement: item.receivedQuantity },
              availableQuantity: { decrement: item.receivedQuantity },
            },
          });
          await tx.stockMovement.create({
            data: {
              tenantId: request.tenantId,
              branchId: batch.branchId,
              medicineId: item.medicineId,
              batchId: batch.id,
              movementType: 'ADJUSTMENT',
              quantity: -item.receivedQuantity,
              quantityAfter: Math.max(0, batch.quantity - item.receivedQuantity),
              referenceType: 'GRN_REVERSAL',
              referenceId: grn.id,
              performedBy: request.user.id,
              notes: request.body?.reason || 'GRN reversed',
            },
          });
          const inventory = await tx.inventory.findFirst({
            where: { tenantId: request.tenantId, branchId: batch.branchId, medicineId: item.medicineId },
          });
          if (inventory) {
            await tx.inventory.update({
              where: { id: inventory.id },
              data: { currentStock: { decrement: item.receivedQuantity } },
            });
          }
        }
        reversalAmount += item.receivedQuantity * toNumber(item.purchasePrice);
        await tx.purchaseOrderItem.update({
          where: { id: item.purchaseOrderItemId },
          data: { receivedQuantity: { decrement: item.receivedQuantity } },
        });
      }

      if (reversalAmount > 0) {
        const balance = await getLastSupplierBalance(tx, request.tenantId, grn.purchaseOrder.supplierId);
        await tx.supplierLedger.create({
          data: {
            tenantId: request.tenantId,
            supplierId: grn.purchaseOrder.supplierId,
            type: 'GRN_REVERSAL',
            referenceType: 'GRN',
            referenceId: grn.id,
            debitAmount: 0,
            creditAmount: reversalAmount,
            balanceAfter: Number((balance - reversalAmount).toFixed(2)),
            notes: request.body?.reason || `Reversal for ${grn.grnNumber}`,
          },
        });
      }

      await tx.goodsReceiptNote.update({
        where: { id: grn.id },
        data: {
          reversedAt: new Date(),
          reversedBy: request.user.id,
          reversalReason: request.body?.reason || null,
        },
      });
      await audit(request.tenantId, request.user.id, 'GRN_REVERSED', `GoodsReceiptNote:${grn.id}`, 'INVENTORY');
      return grn;
    });
    return reply.send({ success: true, data: result, message: 'GRN reversed' });
  });

  fastify.get('/purchase-invoices', {
    schema: { tags: ['Purchase Invoices'], summary: 'List purchase invoices' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: { tenantId: request.tenantId },
      include: { supplier: { select: { id: true, name: true } }, purchaseOrder: { select: { id: true, orderNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ success: true, data: invoices });
  });

  fastify.get('/purchase-invoices/:id', {
    schema: { tags: ['Purchase Invoices'], summary: 'Get purchase invoice detail' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
      include: { supplier: true, purchaseOrder: true, allocations: { include: { payment: true } }, creditNoteUsages: true },
    });
    if (!invoice) return reply.code(404).send({ success: false, message: 'Purchase invoice not found' });
    return reply.send({ success: true, data: invoice });
  });

  fastify.get('/purchase-invoices/:id/pdf', {
    schema: { tags: ['Purchase Invoices'], summary: 'Purchase invoice PDF' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
      include: { supplier: true, purchaseOrder: true },
    });
    if (!invoice) return reply.code(404).send({ success: false, message: 'Purchase invoice not found' });
    return reply.type('text/html').send(`<!doctype html><html><body><h1>Purchase Invoice ${invoice.invoiceNumber}</h1><p>Supplier: ${invoice.supplier?.name || ''}</p><p>Total: ${Number(invoice.totalAmount).toFixed(2)}</p><p>Balance: ${Number(invoice.balanceAmount).toFixed(2)}</p></body></html>`);
  });

  fastify.patch('/purchase-invoices/:id/payment-status', {
    schema: { tags: ['Purchase Invoices'], summary: 'Update purchase invoice payment status' },
    preHandler: [requirePermission('purchase-orders.update')],
  }, async (request, reply) => {
    const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: request.params.id, tenantId: request.tenantId } });
    if (!invoice) return reply.code(404).send({ success: false, message: 'Purchase invoice not found' });
    const paymentStatus = request.body.paymentStatus === 'PARTIALLY_PAID' ? 'PARTIALLY_PAID' : request.body.paymentStatus;
    const paidAmount = request.body.paidAmount !== undefined ? Number(request.body.paidAmount) : toNumber(invoice.paidAmount);
    const balanceAmount = paymentStatus === 'PAID' ? 0 : Math.max(0, toNumber(invoice.totalAmount) - paidAmount);
    const updated = await prisma.purchaseInvoice.update({
      where: { id: invoice.id },
      data: { paymentStatus, paidAmount: paymentStatus === 'PAID' ? invoice.totalAmount : paidAmount, balanceAmount, paidAt: paymentStatus === 'PAID' ? new Date() : invoice.paidAt },
    });
    await audit(request.tenantId, request.user.id, 'PURCHASE_INVOICE_PAYMENT_STATUS_UPDATED', `PurchaseInvoice:${invoice.id}`);
    return reply.send({ success: true, data: updated });
  });

  fastify.post('/purchase-invoices/:id/payment', {
    schema: { tags: ['Purchase Invoices'], summary: 'Record supplier payment against invoice' },
    preHandler: [requirePermission('purchase-orders.update')],
  }, async (request, reply) => {
    request.body.allocations = [{ purchaseInvoiceId: request.params.id, amount: request.body.amount }];
    return fastify.inject({
      method: 'POST',
      url: '/api/supplier-payments',
      headers: request.headers,
      payload: request.body,
    }).then((res) => reply.code(res.statusCode).send(JSON.parse(res.body)));
  });

  fastify.post('/purchase-invoices/:id/adjust', {
    schema: { tags: ['Purchase Invoices'], summary: 'Adjust corrected supplier invoice' },
    preHandler: [requirePermission('purchase-orders.update')],
  }, async (request, reply) => {
    const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: request.params.id, tenantId: request.tenantId } });
    if (!invoice) return reply.code(404).send({ success: false, message: 'Purchase invoice not found' });
    const totalAmount = request.body.totalAmount !== undefined ? Number(request.body.totalAmount) : toNumber(invoice.totalAmount);
    const subtotal = request.body.subtotal !== undefined ? Number(request.body.subtotal) : toNumber(invoice.subtotal);
    const gstAmount = request.body.gstAmount !== undefined ? Number(request.body.gstAmount) : toNumber(invoice.gstAmount);
    const paidAmount = toNumber(invoice.paidAmount);
    const updated = await prisma.purchaseInvoice.update({
      where: { id: invoice.id },
      data: {
        subtotal,
        gstAmount,
        totalAmount,
        balanceAmount: Math.max(0, totalAmount - paidAmount),
        paymentStatus: totalAmount - paidAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING',
      },
    });
    await audit(request.tenantId, request.user.id, 'PURCHASE_INVOICE_ADJUSTED', `PurchaseInvoice:${invoice.id}`);
    return reply.send({ success: true, data: updated });
  });

  fastify.post('/purchase-invoices/:id/landed-cost', {
    schema: { tags: ['Purchase Invoices'], summary: 'Allocate landed costs to purchase invoice' },
    preHandler: [requirePermission('purchase-orders.update')],
  }, async (request, reply) => {
    const invoice = await prisma.purchaseInvoice.findFirst({ where: { id: request.params.id, tenantId: request.tenantId } });
    if (!invoice) return reply.code(404).send({ success: false, message: 'Purchase invoice not found' });
    const charges = Array.isArray(request.body.charges) ? request.body.charges : [];
    const landedCost = charges.reduce((sum, charge) => sum + Number(charge.amount || 0), 0);
    const totalAmount = toNumber(invoice.totalAmount) + landedCost;
    const paidAmount = toNumber(invoice.paidAmount);
    const updated = await prisma.purchaseInvoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount,
        balanceAmount: Math.max(0, totalAmount - paidAmount),
      },
    });
    await audit(request.tenantId, request.user.id, 'LANDED_COST_ALLOCATED', `PurchaseInvoice:${invoice.id}`);
    return reply.send({ success: true, data: updated, landedCost });
  });

  fastify.get('/purchase-invoices/:id/audit', {
    schema: { tags: ['Purchase Invoices'], summary: 'Purchase invoice audit trail' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const data = await prisma.auditLog.findMany({
      where: { tenantId: request.tenantId, target: `PurchaseInvoice:${request.params.id}` },
      orderBy: { date: 'desc' },
    });
    return reply.send({ success: true, data });
  });

  fastify.post('/supplier-payments', {
    schema: { tags: ['Supplier Payments'], summary: 'Record supplier payment' },
    preHandler: [requirePermission('purchase-orders.update')],
  }, async (request, reply) => {
    const body = request.body;
    const allocations = Array.isArray(body.allocations) && body.allocations.length
      ? body.allocations
      : body.purchaseInvoiceId
        ? [{ purchaseInvoiceId: body.purchaseInvoiceId, amount: body.amount }]
        : [];
    if (!allocations.length) return reply.code(400).send({ success: false, message: 'Payment allocations are required' });

    const result = await prisma.$transaction(async (tx) => {
      const firstInvoice = await tx.purchaseInvoice.findFirst({
        where: { id: allocations[0].purchaseInvoiceId, tenantId: request.tenantId },
      });
      if (!firstInvoice && !body.supplierId) throw new Error('Supplier or invoice is required');
      const supplierId = body.supplierId || firstInvoice.supplierId;
      const paymentAmount = Number(body.amount || allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0));
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId: request.tenantId,
          supplierId,
          paymentReference: body.referenceNumber,
          paymentMethod: body.paymentMethod,
          amount: paymentAmount,
          paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
          notes: body.notes,
          createdBy: request.user.id,
          allocations: {
            create: allocations.map((allocation) => ({
              tenantId: request.tenantId,
              purchaseInvoiceId: allocation.purchaseInvoiceId,
              amount: Number(allocation.amount),
            })),
          },
        },
        include: { allocations: true },
      });

      for (const allocation of allocations) {
        await applyInvoicePayment(tx, request.tenantId, allocation.purchaseInvoiceId, Number(allocation.amount));
      }

      const balance = await getLastSupplierBalance(tx, request.tenantId, supplierId);
      await tx.supplierLedger.create({
        data: {
          tenantId: request.tenantId,
          supplierId,
          type: 'PAYMENT',
          referenceType: 'SUPPLIER_PAYMENT',
          referenceId: payment.id,
          debitAmount: 0,
          creditAmount: paymentAmount,
          balanceAfter: Number((balance - paymentAmount).toFixed(2)),
          notes: body.notes || `Supplier payment ${body.referenceNumber || payment.id}`,
        },
      });
      return payment;
    });
    await audit(request.tenantId, request.user.id, 'SUPPLIER_PAYMENT_RECORDED', `SupplierPayment:${result.id}`);
    return reply.code(201).send({ success: true, data: result });
  });

  fastify.get('/supplier-payments', {
    schema: { tags: ['Supplier Payments'], summary: 'List supplier payments' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const data = await prisma.supplierPayment.findMany({
      where: { tenantId: request.tenantId, ...(request.query.supplierId ? { supplierId: request.query.supplierId } : {}) },
      include: { supplier: { select: { id: true, name: true } }, allocations: true },
      orderBy: { paymentDate: 'desc' },
    });
    return reply.send({ success: true, data });
  });

  fastify.get('/supplier-payments/:id', {
    schema: { tags: ['Supplier Payments'], summary: 'Supplier payment detail' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const data = await prisma.supplierPayment.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
      include: { supplier: true, allocations: { include: { purchaseInvoice: true } } },
    });
    if (!data) return reply.code(404).send({ success: false, message: 'Supplier payment not found' });
    return reply.send({ success: true, data });
  });

  fastify.post('/credit-notes', {
    schema: { tags: ['Credit Notes'], summary: 'Create supplier credit note' },
    preHandler: [requirePermission('purchases.create')],
  }, async (request, reply) => {
    const body = request.body;
    const returnRecord = await prisma.supplierReturn.findFirst({ where: { id: body.supplierReturnId, tenantId: request.tenantId } });
    if (!returnRecord) return reply.code(404).send({ success: false, message: 'Supplier return not found' });
    const prefix = `CN-${new Date().getFullYear()}-`;
    const count = await prisma.supplierCreditNote.count({ where: { tenantId: request.tenantId, creditNoteNumber: { startsWith: prefix } } });
    const note = await prisma.supplierCreditNote.create({
      data: {
        tenantId: request.tenantId,
        supplierId: body.supplierId || returnRecord.supplierId,
        returnId: returnRecord.id,
        creditNoteNumber: `${prefix}${String(count + 1).padStart(5, '0')}`,
        amount: Number(body.amount || returnRecord.returnAmount || 0),
        remainingAmount: Number(body.amount || returnRecord.returnAmount || 0),
        notes: body.notes,
        createdBy: request.user.id,
      },
    });
    await audit(request.tenantId, request.user.id, 'CREDIT_NOTE_CREATED', `SupplierCreditNote:${note.id}`);
    return reply.code(201).send({ success: true, data: note });
  });

  fastify.get('/credit-notes', {
    schema: { tags: ['Credit Notes'], summary: 'List credit notes' },
    preHandler: [requirePermission('purchases.read')],
  }, async (request, reply) => {
    const data = await prisma.supplierCreditNote.findMany({
      where: { tenantId: request.tenantId, ...(request.query.supplierId ? { supplierId: request.query.supplierId } : {}) },
      include: { supplier: { select: { id: true, name: true } }, return: { select: { id: true, returnNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ success: true, data });
  });

  fastify.get('/credit-notes/:id', {
    schema: { tags: ['Credit Notes'], summary: 'Credit note detail' },
    preHandler: [requirePermission('purchases.read')],
  }, async (request, reply) => {
    const data = await prisma.supplierCreditNote.findFirst({
      where: { id: request.params.id, tenantId: request.tenantId },
      include: { supplier: true, return: true, usages: true },
    });
    if (!data) return reply.code(404).send({ success: false, message: 'Credit note not found' });
    return reply.send({ success: true, data });
  });

  fastify.post('/credit-notes/:id/apply', {
    schema: { tags: ['Credit Notes'], summary: 'Apply credit note to invoice' },
    preHandler: [requirePermission('purchases.update')],
  }, async (request, reply) => {
    const result = await prisma.$transaction(async (tx) => {
      const note = await tx.supplierCreditNote.findFirst({ where: { id: request.params.id, tenantId: request.tenantId } });
      if (!note) throw new Error('Credit note not found');
      const amount = Number(request.body.amount || request.body.amountToApply);
      if (amount <= 0 || amount > toNumber(note.remainingAmount)) throw new Error('Invalid credit amount');
      await applyInvoicePayment(tx, request.tenantId, request.body.purchaseInvoiceId, amount);
      const usage = await tx.supplierCreditNoteUsage.create({
        data: { creditNoteId: note.id, purchaseInvoiceId: request.body.purchaseInvoiceId, usedAmount: amount, createdBy: request.user.id },
      });
      const remainingAmount = toNumber(note.remainingAmount) - amount;
      const updatedNote = await tx.supplierCreditNote.update({
        where: { id: note.id },
        data: { remainingAmount, status: remainingAmount <= 0 ? 'APPLIED' : note.status, appliedAt: remainingAmount <= 0 ? new Date() : note.appliedAt },
      });
      const balance = await getLastSupplierBalance(tx, request.tenantId, note.supplierId);
      await tx.supplierLedger.create({
        data: {
          tenantId: request.tenantId,
          supplierId: note.supplierId,
          type: 'CREDIT_NOTE',
          referenceType: 'CREDIT_NOTE',
          referenceId: note.id,
          debitAmount: 0,
          creditAmount: amount,
          balanceAfter: Number((balance - amount).toFixed(2)),
          notes: `Credit note ${note.creditNoteNumber} applied`,
        },
      });
      return { usage, creditNote: updatedNote };
    });
    await audit(request.tenantId, request.user.id, 'CREDIT_NOTE_APPLIED', `SupplierCreditNote:${request.params.id}`);
    return reply.send({ success: true, data: result });
  });

  fastify.get('/credit-notes/:id/pdf', {
    schema: { tags: ['Credit Notes'], summary: 'Credit note PDF' },
    preHandler: [requirePermission('purchases.read')],
  }, async (request, reply) => {
    const note = await prisma.supplierCreditNote.findFirst({ where: { id: request.params.id, tenantId: request.tenantId }, include: { supplier: true } });
    if (!note) return reply.code(404).send({ success: false, message: 'Credit note not found' });
    return reply.type('text/html').send(`<!doctype html><html><body><h1>Credit Note ${note.creditNoteNumber}</h1><p>Supplier: ${note.supplier?.name || ''}</p><p>Amount: ${Number(note.amount).toFixed(2)}</p></body></html>`);
  });

  fastify.post('/debit-notes', {
    schema: { tags: ['Debit Notes'], summary: 'Create debit note' },
    preHandler: [requirePermission('purchases.create')],
  }, async (request, reply) => {
    const prefix = `DN-${new Date().getFullYear()}-`;
    const count = await prisma.debitNote.count({ where: { tenantId: request.tenantId, debitNoteNumber: { startsWith: prefix } } });
    const note = await prisma.debitNote.create({
      data: {
        tenantId: request.tenantId,
        supplierId: request.body.supplierId,
        purchaseInvoiceId: request.body.purchaseInvoiceId,
        debitNoteNumber: `${prefix}${String(count + 1).padStart(5, '0')}`,
        amount: Number(request.body.amount),
        reason: request.body.reason,
        createdBy: request.user.id,
      },
    });
    return reply.code(201).send({ success: true, data: note });
  });

  fastify.get('/debit-notes', {
    schema: { tags: ['Debit Notes'], summary: 'List debit notes' },
    preHandler: [requirePermission('purchases.read')],
  }, async (request, reply) => {
    const data = await prisma.debitNote.findMany({ where: { tenantId: request.tenantId }, orderBy: { createdAt: 'desc' } });
    return reply.send({ success: true, data });
  });

  fastify.get('/debit-notes/:id', {
    schema: { tags: ['Debit Notes'], summary: 'Debit note detail' },
    preHandler: [requirePermission('purchases.read')],
  }, async (request, reply) => {
    const data = await prisma.debitNote.findFirst({ where: { id: request.params.id, tenantId: request.tenantId } });
    if (!data) return reply.code(404).send({ success: false, message: 'Debit note not found' });
    return reply.send({ success: true, data });
  });

  fastify.get('/debit-notes/:id/pdf', {
    schema: { tags: ['Debit Notes'], summary: 'Debit note PDF' },
    preHandler: [requirePermission('purchases.read')],
  }, async (request, reply) => {
    const note = await prisma.debitNote.findFirst({ where: { id: request.params.id, tenantId: request.tenantId } });
    if (!note) return reply.code(404).send({ success: false, message: 'Debit note not found' });
    return reply.type('text/html').send(`<!doctype html><html><body><h1>Debit Note ${note.debitNoteNumber}</h1><p>Amount: ${Number(note.amount).toFixed(2)}</p><p>${note.reason}</p></body></html>`);
  });

  fastify.get('/reorder/suggestions', {
    schema: { tags: ['Reorder'], summary: 'Get suggested reorders' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const inventories = await prisma.inventory.findMany({
      where: { tenantId: request.tenantId },
      include: { medicine: { select: { id: true, name: true, reorderLevel: true, reorderQuantity: true } } },
    });
    const suggestions = inventories
      .filter((item) => item.currentStock <= (item.reorderPoint ?? item.medicine?.reorderLevel ?? 10))
      .map((item) => ({
        medicineId: item.medicineId,
        medicineName: item.medicine?.name,
        currentStock: item.currentStock,
        reorderLevel: item.reorderPoint ?? item.medicine?.reorderLevel ?? 10,
        suggestedQty: item.medicine?.reorderQuantity || Math.max((item.reorderPoint ?? 10) * 2, 10),
      }));
    return reply.send({ success: true, data: suggestions });
  });

  fastify.post('/reorder/create-po', {
    schema: { tags: ['Reorder'], summary: 'Create PO from reorder suggestions' },
    preHandler: [requirePermission('purchase-orders.create')],
  }, async (request, reply) => {
    const { default: purchaseOrderService } = await import('../purchase-orders/service/purchase-order.service.js');
    const created = [];
    for (const item of request.body.items || []) {
      created.push(await purchaseOrderService.createReorder(request.tenantId, request.user.id, {
        medicineId: item.medicineId,
        quantity: item.quantity || item.suggestedQty,
      }));
    }
    return reply.code(201).send({ success: true, data: created });
  });

  fastify.get('/procurement/dashboard', {
    schema: { tags: ['Procurement'], summary: 'Procurement dashboard metrics' },
    preHandler: [requirePermission('purchase-orders.read')],
  }, async (request, reply) => {
    const [
      draftPOs,
      pendingApprovalPOs,
      pendingReceipts,
      supplierOutstanding,
      availableCreditNotes,
      overdueInvoices,
    ] = await Promise.all([
      prisma.purchaseOrder.count({ where: { tenantId: request.tenantId, status: 'DRAFT', deletedAt: null } }),
      prisma.purchaseOrder.count({ where: { tenantId: request.tenantId, status: 'PENDING_APPROVAL', deletedAt: null } }),
      prisma.purchaseOrder.count({ where: { tenantId: request.tenantId, status: { in: ['APPROVED', 'SENT', 'SENT_TO_SUPPLIER', 'ACKNOWLEDGED', 'PARTIALLY_RECEIVED'] }, deletedAt: null } }),
      prisma.supplier.aggregate({ where: { tenantId: request.tenantId }, _sum: { outstandingBalance: true } }),
      prisma.supplierCreditNote.aggregate({ where: { tenantId: request.tenantId, status: 'ISSUED' }, _sum: { remainingAmount: true } }),
      prisma.purchaseInvoice.count({ where: { tenantId: request.tenantId, paymentStatus: { in: ['PENDING', 'PARTIAL', 'PARTIALLY_PAID', 'OVERDUE'] }, dueDate: { lt: new Date() } } }),
    ]);
    return reply.send({
      success: true,
      data: {
        draftPOs,
        pendingApprovalPOs,
        pendingReceipts,
        supplierOutstanding: toNumber(supplierOutstanding._sum.outstandingBalance),
        availableCreditNotes: toNumber(availableCreditNotes._sum.remainingAmount),
        overdueInvoices,
      },
    });
  });

  fastify.post('/inventory/reconciliation', {
    schema: { tags: ['Inventory'], summary: 'Create inventory reconciliation record' },
    preHandler: [requirePermission('inventory.update')],
  }, async (request, reply) => {
    const record = await prisma.inventoryReconciliation.create({
      data: {
        tenantId: request.tenantId,
        medicineId: request.body.medicineId,
        branchId: request.body.branchId,
        dbQuantity: Number(request.body.dbQuantity),
        cacheQuantity: Number(request.body.cacheQuantity),
        reconciled: Boolean(request.body.reconciled),
      },
    });
    await audit(request.tenantId, request.user.id, 'INVENTORY_RECONCILIATION_CREATED', `InventoryReconciliation:${record.id}`, 'INVENTORY');
    return reply.code(201).send({ success: true, data: record });
  });
}

export default procurementProductionRoutes;
