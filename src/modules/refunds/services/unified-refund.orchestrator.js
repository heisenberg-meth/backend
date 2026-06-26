import prisma from '../../../config/prisma.js';
import movementService from '../../stock/service/movement.service.js';
import cacheInvalidator from '../../inventory/service/cache-invalidator.service.js';
import logger from '../../../shared/utils/logger.js';
import refundCalculationService from './refund-calculation.service.js';
import pricingService from '../../billing/services/pricing.service.js';
import sequenceService from '../../../shared/services/sequence.service.js';

class UnifiedRefundOrchestrator {
  /**
   * Universal method to process a refund, whether initiated from Billing or Returns module.
   * Guarantees a single authority for Ledger, Inventory, and Invoice aggregates.
   */
  async processRefund({
    tenantId,
    userId,
    invoiceId,
    items = [],
    refundAmount,
    reason,
    returnId = null,
    refundMethod = 'CASH',
  }) {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock Invoice to prevent parallel refund race conditions
      const invoice = await tx.$queryRaw`
        SELECT * FROM "Invoice" WHERE id = ${invoiceId} AND "tenantId" = ${tenantId} FOR UPDATE
      `;

      if (!invoice || invoice.length === 0) {
        throw new Error('Invoice not found');
      }

      const targetInvoice = invoice[0];

      if (targetInvoice.status === 'CANCELLED')
        throw new Error('Cannot refund a cancelled invoice');
      if (targetInvoice.status === 'REFUNDED')
        throw new Error('Invoice has already been fully refunded');

      // 2. Fetch existing refunds to enforce Ledger Validation
      const previousRefunds = await tx.refundPayment.aggregate({
        where: { invoiceId, refundStatus: 'COMPLETED' },
        _sum: { amount: true },
      });
      const previouslyRefunded = Number(previousRefunds._sum.amount || 0);

      // We need to resolve items if this comes from Billing Route directly
      let actualRefundAmount = refundAmount;
      const resolvedItems = [];
      const inventoryMovements = []; // Store movements for later
      const invoiceItemUpdates = []; // Store item updates for later

      // If items are passed, we calculate amount and prepare inventory adjustments
      if (items.length > 0) {
        // Find invoice items for validation
        const invoiceItems = await tx.invoiceItem.findMany({
          where: { invoiceId },
        });

        const refundItemsData = [];

        for (const item of items) {
          const invItem = invoiceItems.find(
            (i) => i.id === item.invoiceItemId || i.medicineId === item.medicineId,
          );
          if (!invItem) throw new Error(`Invoice item not found for refund`);
          if (item.quantity > invItem.quantity) {
            throw new Error(
              `Refund quantity (${item.quantity}) exceeds sold quantity (${invItem.quantity})`,
            );
          }

          const calculatedItemRefund = refundCalculationService.calculateRefundAmount(
            invItem,
            item.quantity,
          );
          refundItemsData.push(calculatedItemRefund);

          // Prepare to restore inventory (executed AFTER Return creation)
          if (invItem.batchId) {
            const idempotencyKey = `refund-${invoiceId}-item-${invItem.id}-qty-${item.quantity}-${Date.now()}`;
            inventoryMovements.push({
              medicineId: invItem.medicineId,
              batchId: invItem.batchId,
              branchId: targetInvoice.branchId,
              movementType: 'RETURN',
              quantity: item.quantity,
              referenceType: 'REFUND',
              referenceId: invoiceId,
              notes: `Unified Refund return: ${reason}`,
              idempotencyKey,
            });
          }

          invoiceItemUpdates.push({
            id: invItem.id,
            quantity: item.quantity,
          });

          resolvedItems.push({
            invoiceItemId: invItem.id,
            medicineId: invItem.medicineId,
            batchId: invItem.batchId,
            quantity: item.quantity,
            amount: calculatedItemRefund.totalRefund,
          });
        }

        if (!actualRefundAmount) {
          const totalRefundData = refundCalculationService.calculateTotalRefund(refundItemsData);
          actualRefundAmount = totalRefundData.totalRefund;
        }
      }

      actualRefundAmount = Number(actualRefundAmount || 0);

      if (actualRefundAmount <= 0) {
        throw new Error('INVALID_REFUND_AMOUNT: Refund amount must be greater than zero');
      }

      // 3. Mandatory Refund Ledger Validation
      const proposedTotal = previouslyRefunded + actualRefundAmount;
      const invoiceTotal = Number(targetInvoice.totalAmount);

      if (proposedTotal > invoiceTotal) {
        throw new Error(
          `Fraud Protection: Requested refund (₹${actualRefundAmount}) plus already refunded (₹${previouslyRefunded}) exceeds Invoice total (₹${invoiceTotal}).`,
        );
      }

      // 4. Create Unified Refund Ledger Entry
      const transactionId = `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      let finalReturnId = returnId;
      let createdSalesReturn = null;
      let updatedReturn = null;

      // FR-1: Create Sale Return First
      if (!returnId && items.length > 0) {
        const returnNumber = await sequenceService.nextRefundNumber(tenantId, tx);
        createdSalesReturn = await tx.return.create({
          data: {
            tenantId,
            branchId: targetInvoice.branchId,
            returnNumber,
            invoiceId,
            saleId: targetInvoice.saleId,
            patientId: targetInvoice.patientId,
            returnReason: reason || 'UNIFIED_REFUND',
            returnType: 'PATIENT_RETURN',
            status: 'REFUNDED',
            totalReturnAmount: actualRefundAmount,
            refundMethod,
            refundStatus: 'COMPLETED',
            refundTransactionId: transactionId,
            createdBy: userId,
            items: {
              create: resolvedItems.map(ri => ({
                invoiceItemId: ri.invoiceItemId,
                medicineId: ri.medicineId,
                batchId: ri.batchId,
                returnedQuantity: ri.quantity,
                returnAmount: ri.amount,
                disposition: 'PENDING'
              }))
            }
          }
        });
        finalReturnId = createdSalesReturn.id;
        
        logger.info(`[Refund] Created Return ID: ${finalReturnId} for Invoice: ${invoiceId}`);
      } else if (returnId) {
        updatedReturn = await tx.return.update({
          where: { id: returnId },
          data: {
            refundMethod,
            refundStatus: 'COMPLETED',
            refundTransactionId: transactionId,
            status: 'REFUNDED',
          },
        });
      }

      // FR-2: Validate SaleReturn Creation
      if (!finalReturnId) {
        throw new Error('SALE_RETURN_CREATION_FAILED: Failed to resolve Return record ID');
      }

      logger.info(`[Refund] Preparing RefundPayment for Return ID: ${finalReturnId}, Invoice: ${invoiceId}`);

      // FR-3: Correct Foreign Key Assignment (RefundPayment references Return)
      const refundPayment = await tx.refundPayment.create({
        data: {
          tenantId,
          invoiceId,
          returnId: finalReturnId,
          paymentMode: refundMethod,
          amount: actualRefundAmount,
          transactionReference: transactionId,
          refundStatus: 'COMPLETED',
          createdBy: userId,
        },
      });

      // FR-7: Inventory Update Order (Only AFTER successful creation of business records)
      for (const movement of inventoryMovements) {
        await movementService.recordMovement(tenantId, movement, userId, tx);
      }

      for (const update of invoiceItemUpdates) {
        await tx.invoiceItem.update({
          where: { id: update.id },
          data: { quantity: { decrement: update.quantity } },
        });
      }

      // 5. Update Invoice aggregates strictly via Unified rules
      const isFullRefund = proposedTotal >= invoiceTotal;
      const totalPaid = Number(targetInvoice.paidAmount);
      const newPaid = Math.max(0, totalPaid - actualRefundAmount);

      const updatedInvoiceItems = await tx.invoiceItem.findMany({
        where: { invoiceId },
      });

      const { totals } = pricingService.calculateInvoiceTotals(
        updatedInvoiceItems,
        Number(targetInvoice.discountAmount) || 0,
      );

      const newBalance = Math.max(0, totals.totalAmount - newPaid);

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotal: totals.subtotal,
          gstAmount: totals.gstAmount,
          totalAmount: totals.totalAmount,
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          paymentStatus: newPaid <= 0 ? 'REFUNDED' : newBalance > 0 ? 'PARTIALLY_PAID' : 'PAID',
        },
      });

      // 6. Create Audit Log
      await tx.invoiceAuditLog.create({
        data: {
          invoiceId,
          action: 'REFUNDED',
          performedBy: userId,
          notes: `Unified refund processed for ₹${actualRefundAmount}. Reason: ${reason}`,
        },
      });

      logger.info(`[Refund] Completed transaction for Return ID: ${finalReturnId}`);

      return {
        refundPayment,
        salesReturn: createdSalesReturn,
        returnRecord: updatedReturn || createdSalesReturn,
        isFullRefund,
        invoiceId,
        tenantId,
        actualRefundAmount,
        medicineIds: resolvedItems.map((i) => i.medicineId).filter(Boolean),
      };
    });

    // Invalidate caches after transaction commits
    try {
      if (result.medicineIds && result.medicineIds.length > 0) {
        await cacheInvalidator.invalidateInventoryCaches(tenantId, result.medicineIds);
      } else {
        await cacheInvalidator.invalidateInventoryCaches(tenantId);
      }
    } catch (err) {
      // Non-critical, log but don't fail
      logger.warn('[REFUND] Cache invalidation failed:', err.message);
    }

    return result;
  }
}

export default new UnifiedRefundOrchestrator();
