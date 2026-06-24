import PDFDocument from 'pdfkit';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import fs from 'fs';
import path from 'path';

class CreditNotePDFService {
  async generateCreditNotePdf(creditNoteId, tenantId) {
    const creditNote = await prisma.supplierCreditNote.findFirst({
      where: { id: creditNoteId, tenantId },
      include: {
        return: {
          include: {
            supplier: true,
            items: { include: { medicine: true } },
          },
        },
        tenant: true,
      },
    });

    if (!creditNote) throw new Error('Credit note not found');

    const buffer = await this._render(creditNote);

    const fileName = `credit-note-${creditNote.creditNoteNumber}.pdf`;
    const storagePath = path.join(process.cwd(), 'uploads', 'credit-notes', fileName);

    if (!fs.existsSync(path.dirname(storagePath))) {
      fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    }

    fs.writeFileSync(storagePath, buffer);

    const pdfUrl = `/uploads/credit-notes/${fileName}`;
    await prisma.supplierCreditNote.update({
      where: { id: creditNoteId },
      data: { pdfUrl },
    });

    logger.info({ creditNoteId, pdfUrl }, 'Credit note PDF generated');
    return pdfUrl;
  }

  async _render(creditNote) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const tenant = creditNote.tenant;
      const supplier = creditNote.return?.supplier;
      const items = creditNote.return?.items || [];

      doc
        .fillColor('#444444')
        .fontSize(20)
        .text(tenant?.name || 'VIYAN MEDASSIST', 50, 57);
      doc.fontSize(10).text(tenant?.address || '', 200, 65, { align: 'right' });
      doc.moveDown();

      doc.moveTo(50, 100).lineTo(550, 100).stroke();

      doc.fontSize(16).fillColor('#2563eb').text('CREDIT NOTE', 50, 115);
      doc.fillColor('#444444');

      const formatDate = (dateVal) => {
        if (!dateVal) return 'N/A';
        const date = new Date(dateVal);
        return isNaN(date.getTime()) ? 'N/A' : date.toLocaleDateString('en-IN');
      };

      doc.fontSize(11);
      doc.text(`Credit Note #: ${creditNote.creditNoteNumber}`, 50, 145);
      doc.text(`Date: ${formatDate(creditNote.issuedDate || creditNote.createdAt)}`, 50, 162);
      doc.text(`Supplier: ${supplier?.name || 'N/A'}`, 50, 179);

      if (creditNote.return) {
        doc.text(`Return #: ${creditNote.return.returnNumber}`, 300, 145);
        doc.text(`Return Date: ${formatDate(creditNote.return.createdAt)}`, 300, 162);
      }

      doc.moveTo(50, 200).lineTo(550, 200).stroke();

      const tableTop = 215;
      doc
        .fontSize(10)
        .text('Medicine', 50, tableTop)
        .text('Batch', 250, tableTop)
        .text('Qty', 330, tableTop)
        .text('Unit Cost', 380, tableTop)
        .text('Loss Amount', 450, tableTop, { align: 'right' });

      doc
        .moveTo(50, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();

      let i = 0;
      items.forEach((item) => {
        const y = tableTop + 30 + i * 22;
        doc
          .fontSize(9)
          .text(item.medicine?.name || 'N/A', 50, y, { width: 190 })
          .text(item.batchId?.slice(0, 8) || 'N/A', 250, y)
          .text(String(item.quantity), 330, y)
          .text(`₹${Number(item.purchasePrice || 0).toFixed(2)}`, 380, y)
          .text(`₹${Number(item.lossAmount || 0).toFixed(2)}`, 450, y, { align: 'right' });
        i++;
      });

      if (items.length === 0) {
        doc.fontSize(9).text('No items', 50, tableTop + 30, { align: 'center', width: 500 });
      }

      const totalY = tableTop + 30 + Math.max(i, 1) * 22 + 30;
      doc.moveTo(50, totalY).lineTo(550, totalY).stroke();

      doc
        .fontSize(12)
        .text('Total Credit Amount:', 350, totalY + 10)
        .text(
          `₹${Number(creditNote.amount || 0).toFixed(2)}`,
          450,
          totalY + 10,
          { align: 'right' },
        );

      if (creditNote.status === 'APPLIED') {
        doc
          .fontSize(10)
          .fillColor('#16a34a')
          .text('STATUS: APPLIED', 50, totalY + 40);
      }

      if (creditNote.notes) {
        doc
          .fontSize(9)
          .fillColor('#666666')
          .text(`Notes: ${creditNote.notes}`, 50, totalY + 60, { width: 500 });
      }

      doc.end();
    });
  }
}

export default new CreditNotePDFService();
