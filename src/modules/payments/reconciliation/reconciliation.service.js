import prisma from '../../../config/prisma.js';
import settlementService from '../settlement/settlement.service.js';
import logger from '../../../shared/utils/logger.js';

/**
 * Reconciliation Service
 * Ensures consistency between external gateway records and internal ERP state.
 */
class ReconciliationService {
  /**
   * Reconcile internal payments with external gateway records.
   * 
   * @param {string} tenantId
   * @param {Array} gatewayRecords Array of { gatewayReference, amount, status, invoiceId }
   */
  async reconcileGatewayPayments(tenantId, gatewayRecords) {
    const results = {
      reconciled: 0,
      alreadyCorrect: 0,
      mismatches: [],
      errors: []
    };

    for (const record of gatewayRecords) {
      try {
        // Find internal payment by reference
        const internalPayment = await prisma.payment.findFirst({
          where: {
            tenantId,
            transactionReference: record.gatewayReference
          },
          include: {
            allocations: true
          }
        });

        if (!internalPayment) {
          // GHOST PAYMENT: Successful in gateway but missing in ERP
          if (record.status === 'SUCCESS' && record.invoiceId) {
            logger.warn({ record, tenantId }, 'Found ghost payment in gateway, attempting to heal...');
            
            await settlementService.settleInvoice({
              tenantId,
              branchId: record.branchId, // if available
              userId: 'SYSTEM_RECONCILE',
              invoiceId: record.invoiceId,
              payments: [{
                method: record.method || 'GATEWAY',
                amount: record.amount,
                referenceNumber: record.gatewayReference
              }],
              idempotencyKey: `recon_${record.gatewayReference}`
            });
            
            results.reconciled++;
          } else {
            results.mismatches.push({
              reference: record.gatewayReference,
              reason: 'Payment missing in ERP and cannot be auto-healed'
            });
          }
          continue;
        }

        // Check for amount or status mismatch
        if (Math.abs(internalPayment.amount - record.amount) > 0.01) {
          results.mismatches.push({
            reference: record.gatewayReference,
            reason: `Amount mismatch: Internal ₹${internalPayment.amount} vs Gateway ₹${record.amount}`
          });
          continue;
        }

        if (internalPayment.status !== record.status) {
          // Status mismatch - might need update
          logger.info({ reference: record.gatewayReference, internalStatus: internalPayment.status, gatewayStatus: record.status }, 'Status mismatch detected');
          
          await prisma.payment.update({
            where: { id: internalPayment.id },
            data: { status: record.status }
          });
          
          results.reconciled++;
        } else {
          results.alreadyCorrect++;
        }

      } catch (error) {
        logger.error({ error, record }, 'Reconciliation error for record');
        results.errors.push({ reference: record.gatewayReference, message: error.message });
      }
    }

    return results;
  }

  /**
   * getDiscrepancies - Identify payments that might need reconciliation.
   */
  async getPotentialDiscrepancies(tenantId) {
    // Find payments that have been PENDING for too long
    const threshold = new Date();
    threshold.setHours(threshold.getHours() - 1);

    return await prisma.payment.findMany({
      where: {
        tenantId,
        status: 'PENDING',
        createdAt: {
          lt: threshold
        }
      },
      include: {
        allocations: {
          include: {
            invoice: true
          }
        }
      }
    });
  }
}

export default new ReconciliationService();
