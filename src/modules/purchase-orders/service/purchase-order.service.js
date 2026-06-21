import prisma from '../../../config/prisma.js';
import purchaseOrderRepository from '../repository/purchase-order.prisma.repository.js';
import { PROCUREMENT_STATUS, DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { procurementStateMachine } from '../../../shared/constants/state-machines.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';
import logger from '../../../shared/utils/logger.js';
import { BadRequestError, NotFoundError } from '../../../shared/utils/errors.js';

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

    if (details.branchId === null) {
      delete details.branchId;
    }

    if (!details.branchId) {
      const creator = await prisma.user.findUnique({
        where: { id: userId },
        select: { branchId: true },
      });
      let resolvedBranchId = creator?.branchId;

      if (!resolvedBranchId) {
        const firstBranch = await prisma.branch.findFirst({
          where: { tenantId },
          select: { id: true },
        });
        resolvedBranchId = firstBranch?.id;
      }

      if (resolvedBranchId) {
        details.branchId = resolvedBranchId;
      }
    }

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
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
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

    emitLocalEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, {
      orderId: order.id,
      tenantId,
      userId,
      supplierId: order.supplierId,
      totalAmount: order.totalAmount,
    });
    await emitEvent(DOMAIN_EVENTS.PURCHASE_ORDER_CREATED, { orderId: order.id, tenantId });

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
      const { receivedItems, notes } = payload;

      logger.info(
        {
          receivedItems,
        },
        'RECEIVED_ITEMS_PAYLOAD',
      );

      if (!receivedItems?.length) {
        throw new BadRequestError('No items provided for receipt');
      }

      logger.info({ purchaseOrderId: id, payload }, 'RECEIVE_GOODS_STARTED');

      const order = await purchaseOrderRepository.findById(id, tenantId);
      if (!order) throw new NotFoundError('Order not found');

      logger.info({ purchaseOrderId: id, status: order.status }, 'PURCHASE_ORDER_LOADED');

      if (!order.supplierId) {
        throw new BadRequestError('Purchase order missing supplierId');
      }
      if (!order.tenantId || order.tenantId !== tenantId) {
        throw new BadRequestError('Purchase order tenantId mismatch or missing');
      }
      if (order.status === PROCUREMENT_STATUS.RECEIVED) {
        throw new BadRequestError('Purchase Order already received');
      }
      const allowedReceiveStatuses = [
        PROCUREMENT_STATUS.APPROVED,
        PROCUREMENT_STATUS.ORDERED,
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

      // Resolve branchId if missing (for legacy POs)
      let resolvedBranchId = order.branchId;
      if (!resolvedBranchId) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { branchId: true },
        });
        resolvedBranchId = user?.branchId;

        // Fallback to first branch in tenant
        if (!resolvedBranchId) {
          const firstBranch = await prisma.branch.findFirst({
            where: { tenantId },
            select: { id: true },
          });
          resolvedBranchId = firstBranch?.id;
        }

        // If still no branch, create a default branch for this tenant
        if (!resolvedBranchId) {
          const defaultBranch = await prisma.branch.create({
            data: {
              tenantId,
              name: 'Main Branch',
              code: 'MAIN',
              isDefault: true,
            },
          });
          resolvedBranchId = defaultBranch.id;
          logger.info(
            { purchaseOrderId: id, branchId: resolvedBranchId, tenantId },
            'Created default branch for PO receipt',
          );
        }

        // If we found a branch, update the PO
        if (resolvedBranchId) {
          await prisma.purchaseOrder.update({
            where: { id },
            data: { branchId: resolvedBranchId },
          });
          logger.info(
            { purchaseOrderId: id, branchId: resolvedBranchId },
            'Auto-resolved branchId for PO',
          );
        }
      }

      const branchId = resolvedBranchId || order.branchId;

      if (!branchId) {
        throw new BadRequestError(
          `Cannot receive stock for PO ${order.orderNumber}: no branch found. ` +
            `Please assign a branch to this purchase order or create a branch for this tenant.`,
        );
      }

      const result = await prisma.$transaction(async (tx) => {
        // Lock the Purchase Order to prevent concurrent receive operations
        await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;

        const now = new Date();
        const grnNumber = `GRN-${now.getTime()}`;

        logger.info({ grnNumber }, 'CREATING_GRN');
        // 1. Create Goods Receipt Note
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

        logger.info({ grnId: grn.id }, 'GRN_CREATED');

        for (const item of receivedItems) {
          const poItem = order.items.find((i) => i.medicineId === item.medicineId);
          if (!poItem) throw new BadRequestError(`Medicine ${item.medicineId} not found in PO`);

          if (item.receivedQuantity < 0) {
            throw new BadRequestError(`Received quantity cannot be negative for ${poItem.medicineName}`);
          }

          const remainingQty = poItem.quantity - poItem.receivedQuantity;
          if (item.receivedQuantity > remainingQty) {
            throw new BadRequestError(
              `Received quantity (${item.receivedQuantity}) exceeds remaining ordered quantity (${remainingQty}) for ${poItem.medicineName}`,
            );
          }

          if (!item.batchNumber) {
            throw new BadRequestError(`Batch number is required for ${poItem.medicineName}`);
          }
          if (!item.expiryDate) {
            throw new BadRequestError(`Expiry date is required for ${poItem.medicineName}`);
          }
          const parsedExpiryDate = new Date(item.expiryDate + 'T00:00:00.000Z');
          if (isNaN(parsedExpiryDate.getTime())) {
            throw new BadRequestError(`Invalid expiry date format for ${poItem.medicineName}`);
          }

          // Validation: Expiry Date >= Today (date-only comparison)
          const today = new Date();
          const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
          if (parsedExpiryDate < todayUTC) {
            throw new BadRequestError(`Expiry date cannot be in the past for ${poItem.medicineName}`);
          }

          // Validation: Purchase Price and Selling Price
          const purchasePrice =
            item.purchasePrice !== undefined
              ? Number(item.purchasePrice)
              : Number(poItem.unitPrice);
          if (purchasePrice <= 0) {
            throw new BadRequestError(`Purchase price must be greater than 0 for ${poItem.medicineName}`);
          }

          const sellingPrice =
            item.sellingPrice !== undefined
              ? Number(item.sellingPrice)
              : item.purchasePrice !== undefined
                ? Number(item.purchasePrice) * 1.2
                : Number(poItem.unitPrice) * 1.2;
          if (sellingPrice <= 0) {
            throw new BadRequestError(`Selling price must be greater than 0 for ${poItem.medicineName}`);
          }

          const mrp = item.mrp !== undefined ? Number(item.mrp) : sellingPrice;
          if (mrp <= 0) {
            throw new BadRequestError(`MRP must be greater than 0 for ${poItem.medicineName}`);
          }

          // 2. Create GRN Item
          await tx.goodsReceiptNoteItem.create({
            data: {
              grnId: grn.id,
              purchaseOrderItemId: poItem.id,
              medicineId: item.medicineId,
              receivedQuantity: item.receivedQuantity,
              batchNumber: item.batchNumber,
              expiryDate: parsedExpiryDate,
              purchasePrice,
              sellingPrice,
            },
          });

          // 3. Create/Update Inventory Batch (Primary mutation)
          // Check if batch already exists for this medicine at this branch
          const existingBatch = await tx.inventoryBatch.findFirst({
            where: {
              tenantId,
              medicineId: item.medicineId,
              batchNumber: item.batchNumber,
              branchId,
            },
          });

          let batch;
          if (existingBatch) {
            logger.info(
              {
                medicineId: item.medicineId,
                batchNumber: item.batchNumber,
                existingBatchId: existingBatch.id,
              },
              'UPDATING_EXISTING_BATCH',
            );

            // Verify that the existing batch has the same expiry date
            const existingExpiryStr = new Date(existingBatch.expiryDate)
              .toISOString()
              .split('T')[0];
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

            batch = await tx.inventoryBatch.update({
              where: { id: existingBatch.id },
              data: updateData,
            });
          } else {
            logger.info(
              { medicineId: item.medicineId, batchNumber: item.batchNumber },
              'CREATING_INVENTORY_BATCH',
            );
            batch = await tx.inventoryBatch.create({
              data: {
                tenantId,
                medicineId: item.medicineId,
                branchId,
                batchNumber: item.batchNumber,
                quantity: item.receivedQuantity,
                availableQuantity: item.receivedQuantity,
                receivedQuantity: item.receivedQuantity,
                expiryDate: parsedExpiryDate,
                purchasePrice,
                sellingPrice,
                mrp,
                supplierId: order.supplierId,
                status: 'ACTIVE',
                purchaseOrderItemId: poItem.id,
              },
            });
          }

          logger.info({ inventoryBatchId: batch.id }, 'INVENTORY_UPDATED');

          // 5. Record Stock Movement in Immutable Ledger
          await tx.stockMovement.create({
            data: {
              tenantId,
              branchId,
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

          logger.info('Updating Inventory');
          // 6. Upsert Inventory Aggregate Snapshot
          const existingInventory = await tx.inventory.findFirst({
            where: {
              tenantId,
              branchId,
              medicineId: item.medicineId,
            },
          });

          if (existingInventory) {
            await tx.inventory.update({
              where: { id: existingInventory.id },
              data: {
                currentStock: { increment: item.receivedQuantity },
              },
            });
          } else {
            await tx.inventory.create({
              data: {
                tenantId,
                branchId,
                medicineId: item.medicineId,
                currentStock: item.receivedQuantity,
              },
            });
          }

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

        logger.info({ newStatus: nextStatus }, 'PO_STATUS_UPDATED');
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

          const lineSubtotal = item.receivedQuantity * Number(poItem.unitPrice);
          const lineGst = lineSubtotal * (Number(poItem.gstPercentage) / 100);
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

        logger.info(
          { invoiceNumber, supplierId: order.supplierId, totalAmount: totalVal },
          'CREATING_PURCHASE_INVOICE',
        );
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

        logger.info({ invoiceId: purchaseInvoice.id }, 'PURCHASE_INVOICE_CREATED');

        // 9. Create/Update Supplier Ledger Entry (Financial Responsibility)
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
            notes: `Goods received via GRN ${grnNumber} for PO ${order.orderNumber}. Invoice ${invoiceNumber} created.`,
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

      // Publish events AFTER transaction commits — if Redis/BullMQ fails,
      // the DB changes are already committed and won't roll back.
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
        logger.error(
          {
            message: eventError.message,
            stack: eventError.stack,
            orderId: id,
          },
          'EVENT_PUBLISH_FAILED_AFTER_RECEIVE — scheduling retry',
        );
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
        {
          grnId: result.grn.id,
          invoiceId: result.purchaseInvoice?.id,
          orderStatus: result.orderStatus,
        },
        'RECEIVE_GOODS_COMPLETED',
      );
      return result;
    } catch (error) {
      logger.error(
        {
          message: error.message,
          stack: error.stack,
          prismaCode: error.code,
          meta: error.meta,
        },
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
}

export default new PurchaseOrderService();
