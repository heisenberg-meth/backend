import prisma from '../../../config/prisma.js';
import purchaseOrderRepository from '../repository/purchase-order.prisma.repository.js';
import { PROCUREMENT_STATUS, DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { procurementStateMachine } from '../../../shared/constants/state-machines.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';

class PurchaseOrderService {
  async getOrders(tenantId, filters = {}) {
    return purchaseOrderRepository.findAll(tenantId, filters);
  }

  async getOrderById(tenantId, id) {
    const order = await purchaseOrderRepository.findById(id, tenantId);
    if (!order) throw new Error('Order not found');
    return order;
  }

  async createOrder(tenantId, userId, data) {
    if (!data.orderNumber) {
      const now = new Date();
      const dateStr =
        now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const random = Math.floor(1000 + Math.random() * 9000);
      data.orderNumber = `PO-${dateStr}-${random}`;
    }

    const { items, ...details } = data;

    if (details.invoiceDate) {
      details.invoiceDate = new Date(details.invoiceDate);
    }

    // Fetch medicine metadata to populate PurchaseOrderItem fields
    const medicineIds = items.map((it) => it.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds } },
      include: {
        inventory: {
          where: { tenantId },
        },
      },
    });

    const medicineMap = new Map(medicines.map((m) => [m.id, m]));

    const mappedItems = items.map((item) => {
      const med = medicineMap.get(item.medicineId);
      if (!med) throw new Error(`Medicine with ID ${item.medicineId} not found`);

      const currentStock = med.inventory?.[0]?.currentStock || 0;
      const reorderQty = med.reorderLevel || 0;
      const unitPrice = Number(item.purchasePrice || item.unitPrice || 0);
      const gstPercentage = Number(item.gstPercentage || med.gstPercentage || 0);
      const qty = Number(item.quantity || 0);

      return {
        medicineId: item.medicineId,
        medicineName: med.name,
        currentStock,
        reorderQty,
        quantity: qty,
        unitPrice,
        gstPercentage,
        totalAmount: qty * unitPrice,
      };
    });

    const order = await purchaseOrderRepository.create(
      {
        ...details,
        status: PROCUREMENT_STATUS.DRAFT,
        items: mappedItems,
      },
      tenantId,
      userId,
    );

    emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, { orderId: order.id, tenantId, userId });
    await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, { orderId: order.id, tenantId });

    return order;
  }

  async submitOrder(tenantId, id) {
    const order = await this.getOrderById(tenantId, id);
    const nextStatus = procurementStateMachine.transition(order.status, 'SUBMIT');

    return prisma.purchaseOrder.update({
      where: { id, tenantId },
      data: { status: nextStatus },
      include: { items: true },
    });
  }

  async approveOrder(tenantId, id, userId, notes) {
    const order = await this.getOrderById(tenantId, id);

    const nextStatus = procurementStateMachine.transition(order.status, 'APPROVE');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id, tenantId },
        data: {
          status: nextStatus,
          approvedBy: userId,
          approvedAt: new Date(),
          notes: notes ? `${order.notes || ''}\nApproval Note: ${notes}` : order.notes,
        },
        include: { items: true },
      });

      await tx.purchaseOrderApproval.create({
        data: {
          purchaseOrderId: id,
          approvedBy: userId,
          approvalNotes: notes,
        },
      });

      emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED, { orderId: id, tenantId, userId });
      await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED, { orderId: id, tenantId });

      return updated;
    });
  }

  async cancelOrder(tenantId, id, userId, reason) {
    const order = await this.getOrderById(tenantId, id);

    const nextStatus = procurementStateMachine.transition(order.status, 'CANCEL');

    const updated = await prisma.purchaseOrder.update({
      where: { id, tenantId },
      data: {
        status: nextStatus,
        cancelledAt: new Date(),
        notes: `${order.notes || ''}\nCancellation Reason: ${reason}`,
      },
      include: { items: true },
    });

    emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CANCELLED, {
      orderId: id,
      tenantId,
      userId,
      reason,
    });
    await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CANCELLED, { orderId: id, tenantId });

    return updated;
  }

  /**
   * Record a Goods Receipt Note (GRN) and update inventory.
   * Never mutates stock silently; always creates batches and logs transactions.
   */
  async receiveOrder(tenantId, id, userId, payload) {
    const { receivedItems, notes } = payload;

    const order = await purchaseOrderRepository.findById(id, tenantId);
    if (!order) throw new Error('Order not found');

    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const grnNumber = `GRN-${now.getTime()}`;

      // 1. Create Goods Receipt Note
      const grn = await tx.goodsReceiptNote.create({
        data: {
          tenantId,
          purchaseOrderId: id,
          grnNumber,
          receivedBy: userId,
          notes,
        },
      });

      for (const item of receivedItems) {
        const poItem = order.items.find((i) => i.medicineId === item.medicineId);
        if (!poItem) throw new Error(`Medicine ${item.medicineId} not found in PO`);

        const remainingQty = poItem.quantity - poItem.receivedQuantity;
        if (item.receivedQuantity > remainingQty) {
          throw new Error(
            `Received quantity (${item.receivedQuantity}) exceeds remaining ordered quantity (${remainingQty}) for ${poItem.medicineName}`,
          );
        }

        // 2. Create GRN Item
        await tx.goodsReceiptNoteItem.create({
          data: {
            grnId: grn.id,
            purchaseOrderItemId: poItem.id,
            medicineId: item.medicineId,
            receivedQuantity: item.receivedQuantity,
            batchNumber: item.batchNumber,
            expiryDate: new Date(item.expiryDate),
            purchasePrice: poItem.unitPrice,
            sellingPrice: item.sellingPrice ? Number(item.sellingPrice) : Number(poItem.unitPrice) * 1.2,
          },
        });

        // 3. Create Inventory Batch (Primary mutation)
        const batch = await tx.inventoryBatch.create({
          data: {
            tenantId,
            medicineId: item.medicineId,
            branchId: order.branchId,
            batchNumber: item.batchNumber,
            quantity: item.receivedQuantity,
            availableQuantity: item.receivedQuantity,
            receivedQuantity: item.receivedQuantity,
            expiryDate: new Date(item.expiryDate),
            purchasePrice: poItem.unitPrice,
            sellingPrice: item.sellingPrice ? Number(item.sellingPrice) : Number(poItem.unitPrice) * 1.2,
            supplierId: order.supplierId,
            status: 'ACTIVE',
            purchaseOrderItemId: poItem.id,
          },
        });

        // 4. Record Inventory Transaction (Movement Log)
        const medicine = await tx.medicine.findUnique({ where: { id: item.medicineId } });
        const currentStock = medicine ? medicine.totalQuantity : 0;

        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            branchId: order.branchId,
            medicineId: item.medicineId,
            batchId: batch.id,
            transactionType: 'PURCHASE',
            quantityChange: item.receivedQuantity,
            quantityAfter: currentStock + item.receivedQuantity,
            referenceType: 'GRN',
            referenceId: grn.id,
            performedBy: userId,
          },
        });

        // 5. Record Stock Movement in Immutable Ledger
        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: order.branchId,
            medicineId: item.medicineId,
            batchId: batch.id,
            movementType: 'PURCHASE',
            quantity: item.receivedQuantity,
            quantityAfter: batch.quantity,
            referenceType: 'GRN',
            referenceId: grn.id,
            performedBy: userId,
            notes: `GRN ${grnNumber} for PO ${order.orderNumber}: ${item.batchNumber}`,
          },
        });

        // 6. Upsert Inventory Aggregate Snapshot
        await tx.inventory.upsert({
          where: {
            tenantId_branchId_medicineId: {
              tenantId,
              branchId: order.branchId,
              medicineId: item.medicineId,
            },
          },
          update: {
            currentStock: { increment: item.receivedQuantity },
          },
          create: {
            tenantId,
            branchId: order.branchId,
            medicineId: item.medicineId,
            currentStock: item.receivedQuantity,
          },
        });

        // 7. Update Medicine Aggregate Quantity
        await tx.medicine.update({
          where: { id: item.medicineId },
          data: { totalQuantity: { increment: item.receivedQuantity } },
        });

        // 8. Update PO Item received quantity tracking
        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQuantity: { increment: item.receivedQuantity } },
        });
      }

      // 7. Determine next PO status using state machine
      const updatedOrder = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { items: true },
      });

      const allReceived = updatedOrder.items.every((i) => i.receivedQuantity >= i.quantity);

      // Determine transition action
      let action = allReceived ? 'RECEIVE_FULL' : 'RECEIVE_PARTIAL';
      if (order.status === PROCUREMENT_STATUS.PARTIALLY_RECEIVED) {
        action = allReceived ? 'RECEIVE_FINAL' : 'RECEIVE_MORE';
      }

      const nextStatus = procurementStateMachine.transition(order.status, action);

      await tx.purchaseOrder.update({
        where: { id },
        data: { status: nextStatus },
      });

      // 8. Generate Purchase Invoice (Goods Received Invoice)
      let invoiceSubtotal = 0;
      let invoiceGstAmount = 0;

      for (const item of receivedItems) {
        const poItem = order.items.find((i) => i.medicineId === item.medicineId);
        if (!poItem) throw new Error(`Medicine ${item.medicineId} not found in PO`);

        const lineSubtotal = item.receivedQuantity * poItem.unitPrice;
        const lineGst = lineSubtotal * (poItem.gstPercentage / 100);
        invoiceSubtotal += lineSubtotal;
        invoiceGstAmount += lineGst;
      }

      const subtotalVal = Number(invoiceSubtotal.toFixed(2));
      const gstVal = Number(invoiceGstAmount.toFixed(2));
      const totalVal = Number((subtotalVal + gstVal).toFixed(2));

      const supplier = await tx.supplier.findUnique({
        where: { id: order.supplierId },
      });
      const paymentTermsDays = supplier?.paymentTermsDays ?? 30;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + paymentTermsDays);

      const invoiceNumber = `PINV-GRN-${grn.grnNumber.replace('GRN-', '')}`;

      const purchaseInvoice = await tx.purchaseInvoice.create({
        data: {
          tenantId,
          supplierId: order.supplierId,
          purchaseOrderId: id,
          invoiceNumber,
          invoiceDate: new Date(),
          dueDate,
          subtotal: subtotalVal,
          gstAmount: gstVal,
          totalAmount: totalVal,
          balanceAmount: totalVal,
          paidAmount: 0,
          paymentStatus: 'PENDING',
        },
      });

      // 9. Create/Update Supplier Ledger Entry (Financial Responsibility)
      const lastBalance = await tx.supplierLedger.findFirst({
        where: { supplierId: order.supplierId, tenantId },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      });

      const currentBalance = lastBalance?.balanceAfter || 0;
      const balanceAfter = currentBalance + totalVal;

      await tx.supplierLedger.create({
        data: {
          tenantId,
          supplierId: order.supplierId,
          type: 'PURCHASE',
          referenceType: 'PURCHASE_INVOICE',
          referenceId: purchaseInvoice.id,
          debitAmount: 0,
          creditAmount: totalVal,
          balanceAfter,
          notes: `Goods received via GRN ${grnNumber} for PO ${order.orderNumber}. Invoice ${invoiceNumber} created.`,
        },
      });

      emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED, {
        orderId: id,
        tenantId,
        grnId: grn.id,
        allReceived,
        totalAmount: totalVal,
      });
      emitLocalEvent(DOMAIN_EVENTS.STOCK_UPDATED, { tenantId, type: 'PURCHASE' });

      await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED, { orderId: id, tenantId });
      await emitEvent(DOMAIN_EVENTS.STOCK_UPDATED, { tenantId });

      return { grn, orderStatus: nextStatus, purchaseInvoice };
    });
  }

  async getOrdersByStatus(tenantId, statuses) {
    return prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        status: { in: statuses },
        deletedAt: null,
      },
      include: {
        items: true,
        supplier: { select: { name: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrdersBySupplier(tenantId, supplierId) {
    return prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        supplierId,
        deletedAt: null,
      },
      include: { items: true, supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPurchaseInvoices(tenantId) {
    const invoices = await prisma.purchaseInvoice.findMany({
      where: { tenantId },
      include: {
        supplier: { select: { name: true } },
        purchaseOrder: { select: { orderNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const grnNumbers = invoices.map((inv) =>
      inv.invoiceNumber.replace('PINV-GRN-', 'GRN-'),
    );

    const grns = await prisma.goodsReceiptNote.findMany({
      where: {
        tenantId,
        grnNumber: { in: grnNumbers },
      },
      include: {
        items: {
          include: {
            medicine: { select: { name: true } },
          },
        },
      },
    });

    const grnMap = new Map(grns.map((g) => [g.grnNumber, g]));

    return invoices.map((inv) => {
      const grnNumber = inv.invoiceNumber.replace('PINV-GRN-', 'GRN-');
      const grn = grnMap.get(grnNumber);
      const items = grn
        ? grn.items.map((item) => ({
            id: item.id,
            medicineId: item.medicineId,
            medicine: item.medicine,
            quantity: item.receivedQuantity,
            purchasePrice: item.purchasePrice ? Number(item.purchasePrice) : 0,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
          }))
        : [];

      return {
        ...inv,
        items,
      };
    });
  }

  async updateStatus(id, tenantId, status) {
    return purchaseOrderRepository.updateStatus(id, tenantId, status);
  }
}

export default new PurchaseOrderService();
