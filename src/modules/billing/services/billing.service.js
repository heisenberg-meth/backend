import invoiceService from './invoice.service.js';
import refundEngine from '../refund-engine/refund.engine.js';
import medicineRepository from '../../inventory/repository/medicine.prisma.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import patientService from '../../patients/services/patient.service.js';
import notificationService from '../../patients/services/notification.service.js';
import prisma from '../../../config/prisma.js';
import anomalyService from '../../fraud-detection/services/anomaly.service.js';

class BillingService {
  /**
   * Create a draft invoice
   */
  async createDraft(tenantId, data, userId) {
    return await invoiceService.createDraft(tenantId, userId, data);
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

  async recordPayment(id, tenantId, userId, paymentData) {
    return await invoiceService.recordPayment(id, tenantId, userId, paymentData);
  }

  async checkout(tenantId, data, userId) {
    return await prisma.$transaction(async (tx) => {
      const draft = await invoiceService.createDraft(tenantId, userId, data, tx);

      const finalized = await invoiceService.finalize(draft.id, tenantId, userId, tx);

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
        console.error('[ANOMALY] Detection failed:', anomalyErr.message);
      }

      return completeInvoice;
    });
  }

  async getInvoices(tenantId, query) {
    const result = await invoiceService.getInvoices(tenantId, query);

    return {
      data: result.invoices,
      pagination: {
        page: parseInt(query.page || 1),
        limit: parseInt(query.limit || 20),
        total: result.total,
        totalPages: Math.ceil(result.total / (query.limit || 20)),
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
      console.error('[SMS] Failed to send notification:', err.message);
    }
  }
}

export default new BillingService();
