import PDFDocument from 'pdfkit';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import fs from 'fs';
import path from 'path';

class PDFService {
  async generateInvoicePdf(invoiceId, tenantId) {
    const invoiceRecord = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { tenant: true },
    });

    if (!invoiceRecord) throw new Error('Invoice not found');

    const invoiceData = invoiceRecord.storedSnapshot || invoiceRecord;

    const buffer = await this._render({ ...invoiceData, tenant: invoiceRecord.tenant });

    const fileName = `invoice-${invoiceRecord.invoiceNumber}.pdf`;
    const storagePath = path.join(process.cwd(), 'uploads', 'invoices', fileName);

    if (!fs.existsSync(path.dirname(storagePath))) {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    }

    fs.writeFileSync(storagePath, buffer);

    const pdfUrl = `/uploads/invoices/${fileName}`;
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdfUrl },
    });

    await prisma.invoiceEvent.create({
      data: {
        invoiceId,
        eventType: 'PDF_GENERATED',
        metadata: { pdfUrl, fileName },
      },
    });

    logger.info({ invoiceId, pdfUrl }, 'Invoice PDF generated successfully');
    return pdfUrl;
  }

  async _render(invoice) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const tenant = invoice.tenant;

      doc
        .fillColor('#444444')
        .fontSize(20)
        .text(tenant.name || 'VIYAN MEDASSIST', 50, 57);
      doc.fontSize(10).text(tenant.address || '', 200, 65, { align: 'right' });
      doc.moveDown();

      doc.moveTo(50, 100).lineTo(550, 100).stroke();

      doc.fontSize(12).text(`Invoice #: ${invoice.invoiceNumber}`, 50, 120);
      doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString()}`, 50, 135);
      doc.text(`Patient: ${invoice.patient?.fullName || 'Walk-in'}`, 50, 150);
      doc.moveDown();

      const tableTop = 200;
      doc
        .fontSize(10)
        .text('Item', 50, tableTop)
        .text('Batch', 180, tableTop)
        .text('Qty', 280, tableTop)
        .text('Price', 350, tableTop)
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
          .text(item.batch?.batchNumber || 'N/A', 180, y)
          .text(item.quantity.toString(), 280, y)
          .text(item.unitPrice.toString(), 350, y)
          .text(item.totalPrice.toString(), 450, y, { align: 'right' });
        i++;
      });

      const subtotalY = tableTop + 30 + i * 25 + 30;
      doc
        .fontSize(12)
        .text('Grand Total:', 350, subtotalY)
        .text(`₹ ${parseFloat(invoice.totalAmount).toFixed(2)}`, 450, subtotalY, {
          align: 'right',
        });

      if (invoice.isCancelled) {
        doc
          .fontSize(30)
          .fillColor('red')
          .opacity(0.3)
          .text('CANCELLED', 100, 400, { align: 'center', width: 400 });
      }

      doc.end();
    });
  }
}

export default new PDFService();
