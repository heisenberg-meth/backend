import invoiceService from './invoice.service.js';
import refundEngine from '../refund-engine/refund.engine.js';
import medicineRepository from '../../inventory/repository/medicine.prisma.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import patientService from '../../patients/services/patient.service.js';
import notificationService from '../../patients/services/notification.service.js';
import prisma from '../../../config/prisma.js';
import anomalyService from '../../fraud-detection/services/anomaly.service.js';
import logger from '../../../shared/utils/logger.js';

class BillingService {
  /**
   * Create a draft invoice
   */
  async createDraft(tenantId, data, userId) {
    return await invoiceService.createDraft(tenantId, userId, data);
  }

  async updateDraft(invoiceId, tenantId, data, userId) {
    return await invoiceService.updateDraft(invoiceId, tenantId, userId, data);
  }

  /**
   * Finalize an invoice and deduct inventory
   */
  async finalize(id, tenantId, userId) {
    const invoice = await invoiceService.finalize(id, tenantId, userId);

    if (invoice.patientId) {
      this._sendInvoiceNotification(tenantId, invoice);
    }

    return invoice;
  }

  async finalizeDraft(id, tenantId, data, userId) {
    return await prisma.$transaction(async (tx) => {
      if (data && (data.items || data.patientId !== undefined || data.patientName || data.discountPercentage !== undefined)) {
        await invoiceService.updateDraft(id, tenantId, userId, data, tx);
      }

      const primaryPaymentMode =
        data?.paymentMode ||
        (data?.payments && data.payments.length > 0 ? data.payments[0].paymentMode : null);

      const finalized = await invoiceService.finalize(id, tenantId, userId, tx, primaryPaymentMode);

      const payments = data?.payments || [];
      if (payments.length === 0 && data?.paymentMode) {
        payments.push({
          paymentMode: data.paymentMode,
          amount: finalized.totalAmount,
        });
      }

      if (payments.length > 0) {
        for (const p of payments) {
          await invoiceService.recordPayment(finalized.id, tenantId, userId, p, tx);
        }
      }

      const completeInvoice = await invoiceService.getInvoice(finalized.id, tenantId, tx);

      if (completeInvoice.patientId) {
        this._sendInvoiceNotification(tenantId, completeInvoice);
      }

      try {
        await anomalyService.detectSalesAnomaly(tenantId, finalized);
      } catch (anomalyErr) {
        logger.error({ err: anomalyErr, tenantId, invoiceId: finalized.id }, 'Sales anomaly detection failed after invoice finalization');
      }

      return completeInvoice;
    });
  }

  async deleteDraft(id, tenantId, userId) {
    const result = await invoiceService.deleteDraft(id, tenantId, userId);

    await auditService.log({
      tenantId,
      userId,
      action: 'DELETE_DRAFT_INVOICE',
      target: id,
      type: 'FINANCIAL',
    });

    return result;
  }

  async getDrafts(tenantId, query = {}) {
    return this.getInvoices(tenantId, { ...query, status: 'DRAFT' });
  }

  async recordPayment(id, tenantId, userId, paymentData) {
    return await invoiceService.recordPayment(id, tenantId, userId, paymentData);
  }

  async checkout(tenantId, data, userId) {
    return await prisma.$transaction(async (tx) => {
      const draft = await invoiceService.createDraft(tenantId, userId, data, tx);

      // Resolve the primary paymentMode from data (supports single-mode or split payments)
      const primaryPaymentMode =
        data.paymentMode ||
        (data.payments && data.payments.length > 0 ? data.payments[0].paymentMode : null);

      const finalized = await invoiceService.finalize(
        draft.id,
        tenantId,
        userId,
        tx,
        primaryPaymentMode,
      );

      const payments = data.payments || [];
      if (payments.length === 0 && data.paymentMode) {
        payments.push({
          paymentMode: data.paymentMode,
          amount: finalized.totalAmount,
        });
      }

      if (payments.length > 0) {
        for (const p of payments) {
          await invoiceService.recordPayment(finalized.id, tenantId, userId, p, tx);
        }
      }

      const completeInvoice = await invoiceService.getInvoice(finalized.id, tenantId, tx);

      try {
        await anomalyService.detectSalesAnomaly(tenantId, finalized);
      } catch (anomalyErr) {
        logger.error({ err: anomalyErr, tenantId, invoiceId: finalized.id }, 'Sales anomaly detection failed after invoice finalization');
      }

      return completeInvoice;
    });
  }

  async getInvoices(tenantId, query) {
    const result = await invoiceService.getInvoices(tenantId, query);
    const limit = parseInt(query.limit || 20);
    let page = parseInt(query.page || 1);
    if (query.skip !== undefined) {
      page = Math.floor(parseInt(query.skip) / limit) + 1;
    }

    return {
      data: result.invoices,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    };
  }

  async getInvoiceById(id, tenantId) {
    return invoiceService.getInvoice(id, tenantId);
  }

  async processRefund(tenantId, userId, data) {
    const result = await refundEngine.processRefund(tenantId, userId, data);

    await auditService.log({
      tenantId,
      userId,
      action: 'REFUND_INVOICE',
      target: data.invoiceId,
      type: 'FINANCIAL',
    });

    return result;
  }

  async cancelInvoice(id, tenantId, userId, reason) {
    const result = await invoiceService.cancelInvoice(id, tenantId, userId, reason);

    await auditService.log({
      tenantId,
      userId,
      action: 'CANCEL_INVOICE',
      target: id,
      type: 'FINANCIAL',
    });

    return result;
  }

  async updateInvoice(id, tenantId, userId, data) {
    const updated = await invoiceService.updateInvoiceMetadata(id, tenantId, data, userId);

    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE_INVOICE',
      target: id,
      type: 'FINANCIAL',
    });

    return updated;
  }

  async scanItem(tenantId, barcode, branchId = null) {
    const medicine = await medicineRepository.findByBarcode(barcode, tenantId, branchId);
    if (!medicine) throw new Error('Medicine not found');
    return medicine;
  }

  async _sendInvoiceNotification(tenantId, invoice) {
    try {
      const patient = await patientService.getCustomerById(invoice.patientId, tenantId);
      if (patient && patient.phone) {
        await notificationService.sendSms(tenantId, {
          patientId: invoice.patientId,
          phone: patient.phone,
          message: `Your invoice ${invoice.invoiceNumber} for ₹${invoice.totalAmount} has been finalized. View: ${process.env.FRONTEND_URL}/billing/invoices/${invoice.id}`,
          type: 'INVOICE',
        });
      }
    } catch (err) {
      logger.warn({ err, invoiceId: invoice?.id, tenantId }, 'Failed to send invoice SMS notification');
    }
  }
}

export default new BillingService();
