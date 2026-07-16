import PDFDocument from 'pdfkit';
import invoiceRepository from '../repositories/invoice.repository.js';
import invoiceEngine from '../invoice-engine/invoice.engine.js';
import { normalizeInvoice } from '../helpers/invoice-dto.js';

class InvoiceService {
  async createDraft(tenantId, userId, data, tx = null) {
    const invoice = await invoiceEngine.createDraft(tenantId, userId, data, tx);
    return normalizeInvoice(invoice);
  }

  async updateDraft(invoiceId, tenantId, userId, data, tx = null) {
    const invoice = await invoiceEngine.updateDraft(invoiceId, tenantId, userId, data, tx);
    return normalizeInvoice(invoice);
  }

  async finalize(id, tenantId, userId, tx = null, paymentMode = null) {
    const invoice = await invoiceEngine.finalize(id, tenantId, userId, tx, paymentMode);
    return normalizeInvoice(invoice);
  }

  async recordPayment(id, tenantId, userId, paymentData, tx = null) {
    const invoice = await invoiceEngine.recordPayment(id, tenantId, userId, paymentData, tx);
    return normalizeInvoice(invoice);
  }

  async cancelInvoice(id, tenantId, userId, reason, tx = null) {
    const invoice = await invoiceEngine.cancel(id, tenantId, userId, reason, tx);
    return normalizeInvoice(invoice);
  }

  async deleteDraft(id, tenantId, userId, tx = null) {
    return await invoiceEngine.deleteDraft(id, tenantId, userId, tx);
  }

  async getInvoice(id, tenantId, tx = null) {
    const invoice = await invoiceRepository.findById(id, tenantId, tx);
    if (!invoice) throw new Error('Invoice not found');
    return normalizeInvoice(invoice);
  }

  async getInvoices(tenantId, params) {
    const {
      page,
      skip: skipParam,
      limit = 20,
      branchId,
      patientId,
      status,
      fromDate,
      toDate,
    } = params;
    const limitInt = parseInt(limit);
    const skip =
      skipParam !== undefined ? parseInt(skipParam) : (parseInt(page || 1) - 1) * limitInt;
    const result = await invoiceRepository.findAll(tenantId, {
      skip,
      take: limitInt,
      branchId,
      patientId,
      status,
      fromDate,
      toDate,
    });

    return {
      invoices: result.invoices.map(normalizeInvoice),
      total: result.total,
    };
  }

  async updateInvoiceMetadata(id, tenantId, data) {
    const allowedUpdates = {};
    if (data.notes !== undefined) allowedUpdates.notes = data.notes;

    if (Object.keys(allowedUpdates).length === 0) {
      throw new Error('No valid fields provided for update');
    }

    return invoiceRepository.update(id, tenantId, allowedUpdates);
  }

  /**
   * Generate an A4 PDF invoice
   */
  async generatePdf(invoice, tenant) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const result = Buffer.concat(buffers);
        resolve(result);
      });

      doc
        .fillColor('#444444')
        .fontSize(20)
        .text(tenant.name || 'Pharmacy Name', 110, 57)
        .fontSize(10)
        .text(tenant.address || 'Address not provided', 200, 65, { align: 'right' })
        .text(`Contact: ${tenant.phone || 'N/A'}`, 200, 80, { align: 'right' })
        .moveDown();

      doc.moveTo(50, 100).lineTo(550, 100).stroke();

      const formatSafeDate = (dateVal) => {
        if (!dateVal) return 'N/A';
        const date = new Date(dateVal);
        return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('en-IN');
      };

      doc
        .fontSize(12)
        .text(`Invoice #: ${invoice.invoiceNumber}`, 50, 120)
        .text(`Date: ${formatSafeDate(invoice.createdAt)}`, 50, 135)
        .text(`Status: ${invoice.status}`, 50, 150)
        .moveDown();

      const tableTop = 200;
      doc
        .fontSize(10)
        .text('Item', 50, tableTop)
        .text('Batch', 150, tableTop)
        .text('Qty', 250, tableTop)
        .text('Price', 300, tableTop)
        .text('GST%', 350, tableTop)
        .text('Total', 450, tableTop, { align: 'right' });

      doc
        .moveTo(50, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();

      let i = 0;
      invoice.items.forEach((item) => {
        const y = tableTop + 30 + i * 25;
        doc
          .text(item.medicine.name, 50, y)
          .text(item.batch?.batchNumber || 'N/A', 150, y)
          .text(item.quantity.toString(), 250, y)
          .text(parseFloat(item.unitPrice).toFixed(2), 300, y)
          .text(item.gstPercentage.toString(), 350, y)
          .text(parseFloat(item.totalPrice).toFixed(2), 450, y, { align: 'right' });
        i++;
      });

      const subtotalY = tableTop + 30 + i * 25 + 30;
      doc
        .moveTo(350, subtotalY - 10)
        .lineTo(550, subtotalY - 10)
        .stroke();

      doc
        .fontSize(10)
        .text('Subtotal:', 350, subtotalY)
        .text(parseFloat(invoice.subtotal).toFixed(2), 450, subtotalY, { align: 'right' })
        .text('GST Amount:', 350, subtotalY + 15)
        .text(parseFloat(invoice.gstAmount).toFixed(2), 450, subtotalY + 15, { align: 'right' })
        .text('Discount:', 350, subtotalY + 30)
        .text(`- ${parseFloat(invoice.discountAmount).toFixed(2)}`, 450, subtotalY + 30, {
          align: 'right',
        })
        .fontSize(12)
        .fillColor('#000000')
        .text('Grand Total:', 350, subtotalY + 50)
        .text(`₹ ${parseFloat(invoice.totalAmount).toFixed(2)}`, 450, subtotalY + 50, {
          align: 'right',
        });

      doc
        .fontSize(10)
        .fillColor('#444444')
        .text('Thank you for your business!', 50, 750, { align: 'center', width: 500 });

      doc.end();
    });
  }
}

export default new InvoiceService();
