import prisma from '../../../config/prisma.js';
import purchaseOrderRepository from '../repository/purchase-order.prisma.repository.js';
import { PROCUREMENT_STATUS, DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { procurementStateMachine } from '../../../shared/constants/state-machines.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import logger from '../../../shared/utils/logger.js';
import { BadRequestError, NotFoundError } from '../../../shared/utils/errors.js';

class PurchaseOrderService {
  async logAudit(txOrPrisma, tenantId, userId, action, target) {
    try {
      await txOrPrisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action,
          target,
          type: 'FINANCIAL',
        },
      });
    } catch (error) {
      logger.warn({ err: error, action, target }, 'PURCHASE_AUDIT_LOG_FAILED');
    }
  }

  async getOrders(tenantId, filters = {}) {
    return purchaseOrderRepository.findAll(tenantId, filters);
  }

  async getOrderById(tenantId, id) {
    const order = await purchaseOrderRepository.findById(id, tenantId);
    if (!order) throw new Error('Order not found');
    return order;
  }

  async createOrder(tenantId, userId, data) {
    const receiptOnlyFields = [
      'batchNumber',
      'expiryDate',
      'manufacturingDate',
      'mrp',
      'sellingPrice',
    ];
    const invalidHeaderField = receiptOnlyFields.find((field) => data[field] !== undefined);
    if (invalidHeaderField) {
      throw new BadRequestError(`${invalidHeaderField} belongs to GRN receiving, not PO creation`);
    }
    const invalidItem = data.items?.find((item) =>
      receiptOnlyFields.some((field) => item[field] !== undefined),
    );
    if (invalidItem) {
      throw new BadRequestError('Batch, invoice, MRP, and actual purchase fields belong to GRN receiving');
    }

    // 1. Validate supplier exists
    const supplier = await prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId, deletedAt: null },
    });
    if (!supplier) throw new BadRequestError('Supplier not found');

    // 2. Resolve branchId
    let branchId = data.branchId || null;
    if (!branchId) {
      const creator = await prisma.user.findUnique({
        where: { id: userId },
        select: { branchId: true },
      });
      branchId = creator?.branchId;
      if (!branchId) {
        const firstBranch = await prisma.branch.findFirst({
          where: { tenantId },
          select: { id: true },
        });
        branchId = firstBranch?.id;
      }
    }

    // 3. Resolve payment terms from supplier if not provided
    const paymentTermsDays = data.paymentTermsDays ?? supplier.paymentTermsDays ?? 30;
    const paymentMode = data.paymentMode ?? 'CREDIT';

    // 4. Expected delivery date
    const expectedDeliveryDate = data.expectedDeliveryDate
      ? new Date(data.expectedDeliveryDate)
      : null;

    // 5. Fetch medicine metadata — never trust frontend for prices/GST
    const medicineIds = data.items.map((it) => it.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds }, deletedAt: null },
      include: {
        inventory: { where: { tenantId }, take: 1 },
      },
    });

    const medicineMap = new Map(medicines.map((m) => [m.id, m]));

    // 6. Build items with server-side calculations
    const mappedItems = [];
    let subtotal = 0;
    let totalGst = 0;

    for (const item of data.items) {
      const med = medicineMap.get(item.medicineId);
      if (!med) throw new BadRequestError(`Medicine with ID ${item.medicineId} not found`);

      const currentStock = med.inventory?.[0]?.currentStock || 0;
      const reorderQty = med.reorderLevel || 0;
      const unitPrice = Number(item.unitPrice ?? item.purchasePrice);
      const gstPercentage = Number(item.gstPercentage ?? med.gstPercentage ?? 0);
      const qty = Number(item.quantity);

      // Server-side calculations
      const itemTotal = Number((qty * unitPrice).toFixed(2));
      const itemGst = Number((itemTotal * gstPercentage / 100).toFixed(2));

      subtotal += itemTotal;
      totalGst += itemGst;

      mappedItems.push({
        medicineId: item.medicineId,
        medicineName: med.name,
        currentStock,
        reorderQty,
        quantity: qty,
        unitPrice,
        gstPercentage,
        totalAmount: itemTotal,
        remainingQuantity: qty,
      });
    }

    // 7. Calculate totals — never trust frontend
    const subtotalRounded = Number(subtotal.toFixed(2));
    const discountAmount = Number((data.discountAmount || 0).toFixed(2));
    const taxableAmount = Number(Math.max(0, subtotalRounded - discountAmount).toFixed(2));
    const totalGstRounded = Number(totalGst.toFixed(2));
    const grandTotal = Number((taxableAmount + totalGstRounded).toFixed(2));

    // 8. Generate order number
    const now = new Date();
    const dateStr =
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `PO-${dateStr}-${random}`;

    // 9. Create Purchase Order in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId,
          userId,
          supplierId: data.supplierId,
          branchId,
          orderNumber,
          status: 'DRAFT',
          expectedDeliveryDate,
          paymentMode,
          paymentTermsDays,
          discountAmount,
          subtotal: subtotalRounded,
          gstAmount: totalGstRounded,
          totalAmount: grandTotal,
          notes: data.notes,
          advancePaid: 0,
          balanceAmount: grandTotal,
          items: { create: mappedItems },
        },
        include: {
          items: true,
          supplier: { select: { id: true, name: true } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'PURCHASE_ORDER_CREATED',
          targetType: 'PURCHASE_ORDER',
          targetId: po.id,
          metadata: {
            orderNumber: po.orderNumber,
            supplierId: data.supplierId,
            supplierName: supplier.name,
            totalAmount: grandTotal,
            itemCount: mappedItems.length,
          },
        },
      });

      return po;
    });

    // Emit events after commit
    try {
      emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, {
        orderId: order.id,
        tenantId,
        userId,
        supplierId: order.supplierId,
        totalAmount: order.totalAmount,
      });
      await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, { orderId: order.id, tenantId });
    } catch (eventError) {
      logger.error({ err: eventError, orderId: order.id }, 'EVENT_PUBLISH_FAILED_AFTER_PO_CREATE');
    }

    return order;
  }

  async createReorder(tenantId, userId, { medicineId, quantity }) {
    if (!medicineId) throw new Error('medicineId is required');
    if (!quantity || quantity <= 0) throw new Error('Quantity must be greater than zero');

    // 1. Load medicine with its inventory and last supplier batch
    const medicine = await prisma.medicine.findFirst({
      where: { id: medicineId, tenantId, deletedAt: null },
      include: {
        inventory: { where: { tenantId }, take: 1 },
        inventoryBatches: {
          where: { tenantId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { supplier: { select: { id: true, name: true } } },
        },
      },
    });

    if (!medicine) throw new Error('Medicine not found or has been deleted');

    // 2. Resolve supplier — prefer last batch supplier, else medicine-level supplier
    const lastBatch = medicine.inventoryBatches?.[0];
    const supplierId = lastBatch?.supplierId ?? null;
    const supplier = lastBatch?.supplier ?? null;

    if (!supplierId) {
      throw new Error(
        `No supplier configured for ${medicine.name}. Please add a supplier via the Suppliers module first.`,
      );
    }

    // 3. Resolve pricing from last batch or medicine defaults
    const purchasePrice = Number(lastBatch?.purchasePrice ?? medicine.purchasePrice ?? 0);
    const sellingPrice = Number(lastBatch?.sellingPrice ?? medicine.sellingPrice ?? purchasePrice * 1.2);
    const mrp = Number(lastBatch?.mrp ?? medicine.mrp ?? sellingPrice);
    const gstPercentage = Number(medicine.gstPercentage ?? 0);

    const currentStock = medicine.inventory?.[0]?.currentStock ?? 0;
    const reorderLevel = medicine.reorderLevel ?? medicine.reorderPoint ?? 10;

    // 4. Generate PO number
    const now = new Date();
    const dateStr =
      now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `PO-${dateStr}-${random}`;

    // 5. Resolve branchId
    let branchId = null;
    const creator = await prisma.user.findUnique({ where: { id: userId }, select: { branchId: true } });
    branchId = creator?.branchId;
    if (!branchId) {
      const firstBranch = await prisma.branch.findFirst({ where: { tenantId }, select: { id: true } });
      branchId = firstBranch?.id;
    }

    const subtotal = Number((quantity * purchasePrice).toFixed(2));
    const gstAmount = Number((subtotal * gstPercentage / 100).toFixed(2));
    const totalAmount = Number((subtotal + gstAmount).toFixed(2));

    // 6. Create Purchase Order in a transaction
    const order = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId,
          supplierId,
          orderNumber,
          status: 'DRAFT',
          branchId,
          subtotal,
          gstAmount,
          totalAmount,
          notes: `Auto-generated reorder from Inventory. Medicine: ${medicine.name}, Current Stock: ${currentStock}, Reorder Level: ${reorderLevel}`,
          createdBy: userId,
          items: {
            create: {
              medicineId,
              medicineName: medicine.name,
              currentStock,
              reorderQty: reorderLevel,
              quantity,
              unitPrice: purchasePrice,
              gstPercentage,
              totalAmount: subtotal,
              remainingQuantity: quantity,
            },
          },
        },
        include: {
          items: true,
          supplier: { select: { id: true, name: true } },
        },
      });

      // 7. Create audit entry
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: 'REORDER_CREATED',
          targetType: 'PURCHASE_ORDER',
          targetId: po.id,
          metadata: {
            medicineId,
            medicineName: medicine.name,
            purchaseOrderId: po.id,
            quantity,
            supplierId,
          },
        },
      });

      return po;
    });

    // Return enriched result for PDF generation
    return {
      purchaseOrder: order,
      medicine: {
        id: medicineId,
        name: medicine.name,
        genericName: medicine.genericName,
        currentStock,
        reorderLevel,
        gstPercentage,
      },
      supplier: { id: supplierId, name: supplier?.name ?? 'Unknown Supplier' },
      pricing: { purchasePrice, sellingPrice, mrp, gstPercentage },
      totals: { subtotal, gstAmount, totalAmount },
    };
  }


  async updateDraftOrder(tenantId, id, userId, data) {
    const order = await this.getOrderById(tenantId, id);
    if (order.status !== PROCUREMENT_STATUS.DRAFT) {
      throw new BadRequestError('Only DRAFT purchase orders can be updated');
    }

    return prisma.$transaction(async (tx) => {
      const updateData = {
        expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : order.expectedDeliveryDate,
        paymentTermsDays: data.paymentTermsDays ?? order.paymentTermsDays,
        notes: data.notes ?? order.notes,
      };

      if (Array.isArray(data.items)) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });

        let subtotal = 0;
        let gstAmount = 0;
        const medicineIds = data.items.map((item) => item.medicineId);
        const medicines = await tx.medicine.findMany({
          where: { id: { in: medicineIds }, tenantId, deletedAt: null },
          include: { inventory: { where: { tenantId }, take: 1 } },
        });
        const medicineMap = new Map(medicines.map((medicine) => [medicine.id, medicine]));

        const mappedItems = data.items.map((item) => {
          const medicine = medicineMap.get(item.medicineId);
          if (!medicine) throw new BadRequestError(`Medicine with ID ${item.medicineId} not found`);
          const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice ?? item.purchasePrice);
          const gstPercentage = Number(item.gstPercentage ?? medicine.gstPercentage ?? 0);
          const totalAmount = Number((quantity * unitPrice).toFixed(2));
          subtotal += totalAmount;
          gstAmount += Number((totalAmount * gstPercentage / 100).toFixed(2));
          return {
            medicineId: item.medicineId,
            medicineName: medicine.name,
            currentStock: medicine.inventory?.[0]?.currentStock || 0,
            reorderQty: medicine.reorderLevel || 0,
            quantity,
            unitPrice,
            gstPercentage,
            totalAmount,
            remainingQuantity: quantity,
          };
        });

        updateData.subtotal = Number(subtotal.toFixed(2));
        updateData.gstAmount = Number(gstAmount.toFixed(2));
        updateData.totalAmount = Number((updateData.subtotal + updateData.gstAmount).toFixed(2));
        updateData.balanceAmount = updateData.totalAmount;
        await tx.purchaseOrderItem.createMany({
          data: mappedItems.map((item) => ({ ...item, purchaseOrderId: id })),
        });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id, tenantId },
        data: updateData,
        include: { items: true },
      });
      await this.logAudit(tx, tenantId, userId, 'PURCHASE_ORDER_UPDATED', `PurchaseOrder:${id}`);
      return updated;
    });
  }

  async deleteDraftOrder(tenantId, id, userId) {
    const order = await this.getOrderById(tenantId, id);
    if (order.status !== PROCUREMENT_STATUS.DRAFT) {
      throw new BadRequestError('Only DRAFT purchase orders can be deleted');
    }
    const deleted = await prisma.purchaseOrder.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
    await this.logAudit(prisma, tenantId, userId, 'PURCHASE_ORDER_DELETED', `PurchaseOrder:${id}`);
    return deleted;
  }

  async submitOrder(tenantId, id, userId) {
    const order = await this.getOrderById(tenantId, id);
    const nextStatus = procurementStateMachine.transition(order.status, 'SUBMIT');

    return prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id, tenantId },
        data: { status: nextStatus },
        include: { items: true },
      });
      await this.logAudit(tx, tenantId, userId, 'PURCHASE_ORDER_SUBMITTED', `PurchaseOrder:${id}`);
      return updated;
    });
  }

  async requestApproval(tenantId, id, userId) {
    const order = await this.getOrderById(tenantId, id);
    if (order.status !== PROCUREMENT_STATUS.DRAFT) {
      throw new BadRequestError('Only DRAFT purchase orders can be submitted for approval');
    }
    const totalAmount = Number(order.totalAmount || 0);
    if (totalAmount < 10000) {
      return this.approveOrder(tenantId, id, userId, 'Auto-approved below threshold');
    }
    return this.submitOrder(tenantId, id, userId);
  }

  async rejectOrder(tenantId, id, userId, reason) {
    if (!reason) throw new BadRequestError('Rejection reason is required');
    const order = await this.getOrderById(tenantId, id);
    const nextStatus = procurementStateMachine.transition(order.status, 'REJECT');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id, tenantId },
        data: {
          status: nextStatus,
          notes: `${order.notes || ''}\nRejection Reason: ${reason}`,
        },
        include: { items: true },
      });
      await this.logAudit(tx, tenantId, userId, 'PURCHASE_ORDER_REJECTED', `PurchaseOrder:${id}`);
      return updated;
    });
  }

  async sendOrder(tenantId, id, userId) {
    const order = await this.getOrderById(tenantId, id);
    const nextStatus = procurementStateMachine.transition(order.status, 'PLACE_ORDER');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id, tenantId },
        data: { status: nextStatus, sentAt: new Date() },
        include: { items: true },
      });
      await this.logAudit(tx, tenantId, userId, 'PURCHASE_ORDER_SENT_TO_SUPPLIER', `PurchaseOrder:${id}`);
      return updated;
    });
  }

  async acknowledgeOrder(tenantId, id, userId) {
    const order = await this.getOrderById(tenantId, id);
    const nextStatus = procurementStateMachine.transition(order.status, 'ACKNOWLEDGE');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({
        where: { id, tenantId },
        data: { status: nextStatus, acknowledgedAt: new Date() },
        include: { items: true },
      });
      await this.logAudit(tx, tenantId, userId, 'PURCHASE_ORDER_ACKNOWLEDGED', `PurchaseOrder:${id}`);
      return updated;
    });
  }

  async reviseOrder(tenantId, id, userId, payload) {
    const order = await this.getOrderById(tenantId, id);
    if (!['APPROVED', 'SENT', 'SENT_TO_SUPPLIER', 'ACKNOWLEDGED'].includes(order.status)) {
      throw new BadRequestError('Only approved or supplier-facing purchase orders can be revised');
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new BadRequestError('Revision items are required');
    }
    if (!payload.reason) throw new BadRequestError('Revision reason is required');

    return prisma.$transaction(async (tx) => {
      const revisionCount = await tx.purchaseOrderRevision.count({ where: { purchaseOrderId: id } });
      const changes = [];
      for (const item of payload.items) {
        const existing = order.items.find((poItem) => poItem.id === item.purchaseOrderItemId);
        if (!existing) throw new BadRequestError(`PO item ${item.purchaseOrderItemId} not found`);
        const quantity = Number(item.quantity);
        if (quantity < existing.receivedQuantity) {
          throw new BadRequestError('Revised quantity cannot be lower than already received quantity');
        }
        changes.push({ purchaseOrderItemId: existing.id, from: existing.quantity, to: quantity });
        await tx.purchaseOrderItem.update({
          where: { id: existing.id },
          data: {
            quantity,
            totalAmount: Number((quantity * Number(existing.unitPrice)).toFixed(2)),
          },
        });
      }

      const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
      const subtotal = items.reduce((sum, item) => sum + Number(item.totalAmount), 0);
      const gstAmount = items.reduce(
        (sum, item) => sum + Number(item.totalAmount) * (Number(item.gstPercentage) / 100),
        0,
      );

      await tx.purchaseOrderRevision.create({
        data: {
          purchaseOrderId: id,
          revisionNumber: revisionCount + 1,
          reason: payload.reason,
          changes,
          revisedBy: userId,
        },
      });

      const updated = await tx.purchaseOrder.update({
        where: { id, tenantId },
        data: {
          subtotal: Number(subtotal.toFixed(2)),
          gstAmount: Number(gstAmount.toFixed(2)),
          totalAmount: Number((subtotal + gstAmount).toFixed(2)),
        },
        include: { items: true, revisions: true },
      });
      await this.logAudit(tx, tenantId, userId, 'PURCHASE_ORDER_REVISED', `PurchaseOrder:${id}`);
      return updated;
    });
  }

  async getAudit(tenantId, id) {
    return prisma.auditLog.findMany({
      where: {
        tenantId,
        OR: [
          { target: `PurchaseOrder:${id}` },
          { target: id },
        ],
      },
      orderBy: { date: 'desc' },
    });
  }

  async approveOrder(tenantId, id, userId, notes) {
    const order = await this.getOrderById(tenantId, id);

    // Validate branchId before approving
    if (!order.branchId || typeof order.branchId !== 'string') {
      throw new Error(
        'Cannot approve purchase order: branchId is missing. Please assign a branch to this order first.',
      );
    }

    const nextStatus = procurementStateMachine.transition(order.status, 'APPROVE');

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.purchaseOrder.update({
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

      return result;
    });

    try {
      emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED, { orderId: id, tenantId, userId });
      await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_APPROVED, { orderId: id, tenantId });
    } catch (eventError) {
      logger.error(
        { message: eventError.message, orderId: id },
        'EVENT_PUBLISH_FAILED_AFTER_APPROVE — scheduling retry',
      );
      try {
        const { mainQueue } = await import('../../../queue/index.js');
        await mainQueue.add(
          'retry-po-approved-events',
          { orderId: id, tenantId, attempt: 1 },
          { attempts: 5, backoff: { type: 'exponential', delay: 15000 } },
        );
      } catch (queueErr) {
        logger.error({ err: queueErr, orderId: id }, 'CRITICAL: Failed to queue PO approved event retry');
      }
    }

    return updated;
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

  async receiveOrder(tenantId, id, userId, payload) {
    try {
      const { supplierInvoiceNumber, invoiceDate, receivedItems, notes } = payload;

      if (!supplierInvoiceNumber) throw new BadRequestError('Supplier invoice number is required');
      if (!invoiceDate) throw new BadRequestError('Invoice date is required');
      if (!receivedItems?.length) throw new BadRequestError('No items provided for receipt');

      logger.info({ purchaseOrderId: id, payload }, 'RECEIVE_GOODS_STARTED');

      const order = await purchaseOrderRepository.findById(id, tenantId);
      if (!order) throw new NotFoundError('Order not found');

      logger.info({ purchaseOrderId: id, status: order.status }, 'PURCHASE_ORDER_LOADED');

      if (!order.supplierId) throw new BadRequestError('Purchase order missing supplierId');
      if (!order.tenantId || order.tenantId !== tenantId) {
        throw new BadRequestError('Purchase order tenantId mismatch or missing');
      }
      if (order.status === PROCUREMENT_STATUS.RECEIVED) {
        throw new BadRequestError('Purchase Order already received');
      }
      const allowedReceiveStatuses = [
        PROCUREMENT_STATUS.APPROVED,
        PROCUREMENT_STATUS.ORDERED,
        PROCUREMENT_STATUS.SENT_TO_SUPPLIER,
        PROCUREMENT_STATUS.ACKNOWLEDGED,
        PROCUREMENT_STATUS.PARTIALLY_RECEIVED,
      ];
      if (!allowedReceiveStatuses.includes(order.status)) {
        throw new BadRequestError(
          `Purchase order must be APPROVED, ORDERED, or PARTIALLY_RECEIVED to receive goods. Current status: ${order.status}`,
        );
      }
      if (!order.items?.length) {
        throw new BadRequestError('Purchase order has no items to receive');
      }

      logger.info({ receivedItemsCount: receivedItems.length }, 'VALIDATION_PASSED');

      // Resolve branchId if missing
      let resolvedBranchId = order.branchId;
      if (!resolvedBranchId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { branchId: true },
        });
        resolvedBranchId = user?.branchId;

        if (!resolvedBranchId) {
          const firstBranch = await prisma.branch.findFirst({
            where: { tenantId },
            select: { id: true },
          });
          resolvedBranchId = firstBranch?.id;
        }

        if (!resolvedBranchId) {
          const defaultBranch = await prisma.branch.create({
            data: { tenantId, name: 'Main Branch', code: 'MAIN', isDefault: true },
          });
          resolvedBranchId = defaultBranch.id;
          logger.info(
            { purchaseOrderId: id, branchId: resolvedBranchId, tenantId },
            'Created default branch for PO receipt',
          );
        }

        if (resolvedBranchId) {
          await prisma.purchaseOrder.update({
            where: { id },
            data: { branchId: resolvedBranchId },
          });
        }
      }

      const branchId = resolvedBranchId || order.branchId;
      if (!branchId) {
        throw new BadRequestError(
          `Cannot receive stock for PO ${order.orderNumber}: no branch found.`,
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;

        const now = new Date();
        const grnNumber = `GRN-${now.getTime()}`;

        // 1. Create GRN
        const grn = await tx.goodsReceiptNote.create({
          data: {
            tenantId,
            purchaseOrderId: id,
            grnNumber,
            receivedDate: now,
            receivedBy: userId,
            notes,
          },
        });

        for (const item of receivedItems) {
          // Find PO item by purchaseOrderItemId
          const poItem = order.items.find((i) => i.id === item.purchaseOrderItemId);
          if (!poItem) {
            throw new BadRequestError(`PO item ${item.purchaseOrderItemId} not found in this order`);
          }

          if (item.receivedQuantity < 0) {
            throw new BadRequestError(`Received quantity cannot be negative for ${poItem.medicineName}`);
          }

          const remainingQty = poItem.quantity - poItem.receivedQuantity;
          if (item.receivedQuantity > remainingQty) {
            throw new BadRequestError(
              `Received quantity (${item.receivedQuantity}) exceeds remaining ordered quantity (${remainingQty}) for ${poItem.medicineName}`,
            );
          }

          if (!item.batchNumber) throw new BadRequestError(`Batch number is required for ${poItem.medicineName}`);
          if (!item.expiryDate) throw new BadRequestError(`Expiry date is required for ${poItem.medicineName}`);

          const parsedExpiryDate = new Date(item.expiryDate);
          if (isNaN(parsedExpiryDate.getTime())) {
            throw new BadRequestError(`Invalid expiry date format for ${poItem.medicineName}`);
          }

          const today = new Date();
          const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
          if (parsedExpiryDate < todayUTC) {
            throw new BadRequestError(`Expiry date cannot be in the past for ${poItem.medicineName}`);
          }

          const purchasePrice = Number(item.purchasePrice);
          if (purchasePrice <= 0) throw new BadRequestError(`Purchase price must be > 0 for ${poItem.medicineName}`);

          const sellingPrice = Number(item.sellingPrice);
          if (sellingPrice <= 0) throw new BadRequestError(`Selling price must be > 0 for ${poItem.medicineName}`);

          const mrp = Number(item.mrp);
          if (mrp <= 0) throw new BadRequestError(`MRP must be > 0 for ${poItem.medicineName}`);

          const manufacturingDate = item.manufacturingDate ? new Date(item.manufacturingDate) : null;

          // 2. Create GRN Item
          await tx.goodsReceiptNoteItem.create({
            data: {
              grnId: grn.id,
              purchaseOrderItemId: poItem.id,
              medicineId: poItem.medicineId,
              receivedQuantity: item.receivedQuantity,
              batchNumber: item.batchNumber,
              expiryDate: parsedExpiryDate,
              purchasePrice,
              sellingPrice,
            },
          });

          // 3. Create/Update InventoryBatch
          const existingBatch = await tx.inventoryBatch.findFirst({
            where: {
              tenantId,
              medicineId: poItem.medicineId,
              batchNumber: item.batchNumber,
              branchId,
            },
          });

          let batch;
          if (existingBatch) {
            const existingExpiryStr = new Date(existingBatch.expiryDate).toISOString().split('T')[0];
            const newExpiryStr = parsedExpiryDate.toISOString().split('T')[0];
            if (existingExpiryStr !== newExpiryStr) {
              throw new BadRequestError(
                `Batch '${item.batchNumber}' already exists at this branch with a different expiry date (${existingExpiryStr})`,
              );
            }

            const updateData = {
              quantity: { increment: item.receivedQuantity },
              availableQuantity: { increment: item.receivedQuantity },
              receivedQuantity: { increment: item.receivedQuantity },
            };

            if (existingBatch.deletedAt) {
              updateData.deletedAt = null;
              updateData.status = 'ACTIVE';
            }
            if (!existingBatch.supplierId && order.supplierId) {
              updateData.supplierId = order.supplierId;
            }

            batch = await tx.inventoryBatch.update({
              where: { id: existingBatch.id },
              data: updateData,
            });
          } else {
            batch = await tx.inventoryBatch.create({
              data: {
                tenantId,
                medicineId: poItem.medicineId,
                branchId,
                batchNumber: item.batchNumber,
                quantity: item.receivedQuantity,
                availableQuantity: item.receivedQuantity,
                receivedQuantity: item.receivedQuantity,
                expiryDate: parsedExpiryDate,
                manufacturingDate,
                purchasePrice,
                sellingPrice,
                mrp,
                supplierId: order.supplierId,
                status: 'ACTIVE',
                purchaseOrderItemId: poItem.id,
              },
            });
          }

          // 4. Stock Movement
          await tx.stockMovement.create({
            data: {
              tenantId,
              branchId,
              medicineId: poItem.medicineId,
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

          // 5. Upsert Inventory Aggregate
          const existingInventory = await tx.inventory.findFirst({
            where: { tenantId, branchId, medicineId: poItem.medicineId },
          });

          if (existingInventory) {
            await tx.inventory.update({
              where: { id: existingInventory.id },
              data: { currentStock: { increment: item.receivedQuantity } },
            });
          } else {
            await tx.inventory.create({
              data: {
                tenantId,
                branchId,
                medicineId: poItem.medicineId,
                currentStock: item.receivedQuantity,
              },
            });
          }

          // 6. Update PO Item received quantity
          await tx.purchaseOrderItem.update({
            where: { id: poItem.id },
            data: { receivedQuantity: { increment: item.receivedQuantity } },
          });
        }

        // 7. Determine next PO status
        const updatedOrder = await tx.purchaseOrder.findUnique({
          where: { id },
          include: { items: true },
        });

        const allReceived = updatedOrder.items.every((i) => i.receivedQuantity >= i.quantity);

        let action = allReceived ? 'RECEIVE_FULL' : 'RECEIVE_PARTIAL';
        if (order.status === PROCUREMENT_STATUS.PARTIALLY_RECEIVED) {
          action = allReceived ? 'RECEIVE_FINAL' : 'RECEIVE_MORE';
        }

        const nextStatus = procurementStateMachine.transition(order.status, action);

        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: nextStatus,
            receivedAt: now,
          },
        });

        // 8. Generate Purchase Invoice
        let invoiceSubtotal = 0;
        let invoiceGstAmount = 0;

        for (const item of receivedItems) {
          const poItem = order.items.find((i) => i.id === item.purchaseOrderItemId);
          const lineSubtotal = item.receivedQuantity * Number(poItem.unitPrice);
          const lineGst = lineSubtotal * (Number(poItem.gstPercentage) / 100);
          invoiceSubtotal += lineSubtotal;
          invoiceGstAmount += lineGst;
        }

        const subtotalVal = Number(invoiceSubtotal.toFixed(2));
        const gstVal = Number(invoiceGstAmount.toFixed(2));
        const totalVal = Number((subtotalVal + gstVal).toFixed(2));

        const supplier = await tx.supplier.findUnique({ where: { id: order.supplierId } });
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
            invoiceDate: new Date(invoiceDate),
            dueDate,
            subtotal: subtotalVal,
            gstAmount: gstVal,
            totalAmount: totalVal,
            balanceAmount: totalVal,
            paidAmount: 0,
            paymentStatus: 'PENDING',
          },
        });

        // 9. Supplier Ledger Entry
        const lastBalance = await tx.supplierLedger.findFirst({
          where: { supplierId: order.supplierId, tenantId },
          orderBy: { createdAt: 'desc' },
          select: { balanceAfter: true },
        });

        const currentBalance = parseFloat(String(lastBalance?.balanceAfter || 0));
        const balanceAfter = Number((currentBalance + Number(totalVal)).toFixed(2));

        await tx.supplierLedger.create({
          data: {
            tenantId,
            supplierId: order.supplierId,
            type: 'PURCHASE',
            referenceType: 'PURCHASE_INVOICE',
            referenceId: purchaseInvoice.id,
            debitAmount: Number(totalVal),
            creditAmount: 0,
            balanceAfter,
            notes: `GRN ${grnNumber} for PO ${order.orderNumber}. Invoice ${invoiceNumber}.`,
          },
        });

        return {
          grn,
          orderStatus: nextStatus,
          purchaseInvoice,
          allReceived,
          totalAmount: totalVal,
        };
      });

      // Emit events after commit
      try {
        emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED, {
          orderId: id,
          tenantId,
          grnId: result.grn.id,
          allReceived: result.allReceived,
          totalAmount: result.totalAmount,
        });
        emitLocalEvent(DOMAIN_EVENTS.STOCK_UPDATED, { tenantId, type: 'PURCHASE' });
        await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_RECEIVED, { orderId: id, tenantId });
        await emitEvent(DOMAIN_EVENTS.STOCK_UPDATED, { tenantId });
      } catch (eventError) {
        logger.error({ err: eventError, orderId: id }, 'EVENT_PUBLISH_FAILED_AFTER_RECEIVE');
        try {
          const { mainQueue } = await import('../../../queue/index.js');
          await mainQueue.add(
            'retry-po-received-events',
            { orderId: id, tenantId, attempt: 1 },
            { attempts: 5, backoff: { type: 'exponential', delay: 15000 } },
          );
        } catch (queueErr) {
          logger.error({ err: queueErr, orderId: id }, 'CRITICAL: Failed to queue PO received event retry');
        }
      }

      logger.info(
        { grnId: result.grn.id, invoiceId: result.purchaseInvoice?.id, orderStatus: result.orderStatus },
        'RECEIVE_GOODS_COMPLETED',
      );
      return result;
    } catch (error) {
      logger.error(
        { message: error.message, stack: error.stack, prismaCode: error.code, meta: error.meta },
        'RECEIVE_GOODS_FAILED',
      );
      throw error;
    }
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

    const grnNumbers = invoices.map((inv) => inv.invoiceNumber.replace('PINV-GRN-', 'GRN-'));

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

  async updatePaymentStatus(tenantId, invoiceId, { paymentStatus, paidAmount }, userId) {
    const invoice = await prisma.purchaseInvoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice) throw new Error('Purchase invoice not found');

    const validStatuses = ['PENDING', 'PAID', 'PARTIAL'];
    if (!validStatuses.includes(paymentStatus)) {
      throw new Error('Invalid payment status');
    }

    const totalAmount = Number(invoice.totalAmount);
    let newPaidAmount = Number(invoice.paidAmount);
    let newBalanceAmount = Number(invoice.balanceAmount);
    let newPaidAt = invoice.paidAt;

    if (paymentStatus === 'PAID') {
      newPaidAmount = totalAmount;
      newBalanceAmount = 0;
      newPaidAt = new Date();
    } else if (paymentStatus === 'PENDING') {
      newPaidAmount = 0;
      newBalanceAmount = totalAmount;
      newPaidAt = null;
    } else if (paymentStatus === 'PARTIAL') {
      if (paidAmount !== undefined && paidAmount !== null) {
        newPaidAmount = Math.min(Math.max(Number(paidAmount), 0), totalAmount);
      }
      newBalanceAmount = totalAmount - newPaidAmount;
      newPaidAt = newPaidAmount > 0 ? (invoice.paidAt || new Date()) : null;
    }

    const updated = await prisma.purchaseInvoice.update({
      where: { id: invoiceId },
      data: {
        paymentStatus,
        paidAmount: newPaidAmount,
        balanceAmount: newBalanceAmount,
        paidAt: newPaidAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'PAYMENT_STATUS_UPDATED',
        target: `PurchaseInvoice:${invoiceId}`,
        type: 'PAYMENT',
      },
    });

    return updated;
  }
}

export default new PurchaseOrderService();
