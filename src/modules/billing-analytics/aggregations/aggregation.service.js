import prisma from '../../../config/prisma.js';
import dashboardService from '../services/dashboard.service.js';
import logger from '../../../shared/utils/logger.js';

class AggregationService {
  /**
   * Update daily sales summary upon invoice generation
   */
  async handleInvoiceGenerated(invoice) {
    const salesDate = new Date(invoice.createdAt);
    salesDate.setHours(0, 0, 0, 0);

    const { tenantId, branchId, totalAmount, discountAmount, gstAmount } = invoice;
    const totalItemsSold = invoice.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

    try {
      // 1. Update pre-aggregated summary
      await prisma.dailySalesSummary.upsert({
        where: {
          tenantId_branchId_salesDate: {
            tenantId,
            branchId,
            salesDate,
          },
        },
        update: {
          totalSales: { increment: totalAmount },
          totalInvoices: { increment: 1 },
          totalItemsSold: { increment: totalItemsSold },
          totalDiscount: { increment: discountAmount },
          totalGst: { increment: gstAmount },
        },
        create: {
          tenantId,
          branchId,
          salesDate,
          totalSales: totalAmount,
          totalInvoices: 1,
          totalItemsSold,
          totalDiscount: discountAmount,
          totalGst: gstAmount,
        },
      });

      // 2. Refresh realtime feed cache
      await dashboardService.refreshSalesFeed(tenantId, branchId);

      logger.info({ invoiceId: invoice.id, tenantId }, 'DailySalesSummary updated for invoice generation');
    } catch (error) {
      logger.error({ error, invoiceId: invoice.id }, 'Failed to update DailySalesSummary');
    }
  }

  /**
   * Update payment analytics upon payment settlement
   */
  async handlePaymentSettled(payload) {
    const { tenantId, branchId, amount, paymentMethod, settledAt } = payload;
    const paymentDate = new Date(settledAt);
    paymentDate.setHours(0, 0, 0, 0);

    try {
      // 1. Update PaymentMethodAnalytics
      await prisma.paymentMethodAnalytics.upsert({
        where: {
          tenantId_branchId_paymentDate_paymentMethod: {
            tenantId,
            branchId,
            paymentDate,
            paymentMethod
          }
        },
        update: {
          totalAmount: { increment: amount },
          totalCount: { increment: 1 }
        },
        create: {
          tenantId,
          branchId,
          paymentDate,
          paymentMethod,
          totalAmount: amount,
          totalCount: 1
        }
      });

      // 2. Update DailySalesSummary (specific payment columns)
      const updateData = {};
      if (paymentMethod === 'CASH') updateData.cashSales = { increment: amount };
      else if (paymentMethod === 'CARD') updateData.cardSales = { increment: amount };
      else if (paymentMethod === 'UPI') updateData.upiSales = { increment: amount };

      if (Object.keys(updateData).length > 0) {
        await prisma.dailySalesSummary.update({
          where: {
            tenantId_branchId_salesDate: {
              tenantId,
              branchId,
              salesDate: paymentDate
            }
          },
          data: updateData
        });
      }

      logger.info({ tenantId, paymentMethod, amount }, 'Analytics updated for payment settlement');
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to update analytics for payment');
    }
  }

  /**
   * Update daily summaries for refunds
   */
  async handleRefundProcessed(payload) {
    const { tenantId, branchId, refundAmount, refundedAt } = payload;
    const date = new Date(refundedAt);
    date.setHours(0, 0, 0, 0);

    try {
      await prisma.dailySalesSummary.update({
        where: {
          tenantId_branchId_salesDate: {
            tenantId,
            branchId,
            salesDate: date
          }
        },
        data: {
          totalReturns: { increment: refundAmount }
        }
      });
      logger.info({ tenantId, refundAmount }, 'DailySalesSummary updated for refund');
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to update DailySalesSummary for refund');
    }
  }
}

export default new AggregationService();
