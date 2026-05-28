import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import logger from '../../../shared/utils/logger.js';

class PdfRendererService {
  async renderA4(invoice, tenant, options = {}) {
    const { watermark, duplicateCopy, templateConfig = {} } = options;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        this.addHeader(doc, tenant, invoice, templateConfig);

        if (watermark) {
          this.addWatermark(doc, watermark);
        }

        if (duplicateCopy) {
          this.addWatermark(doc, 'DUPLICATE COPY');
        }

        this.addInvoiceDetails(doc, invoice, templateConfig);
        this.addItemsTable(doc, invoice, templateConfig);
        this.addTotals(doc, invoice, templateConfig);

        if (templateConfig.showGSTBreakdown !== false) {
          this.addGSTBreakdown(doc, invoice, templateConfig);
        }

        this.addQRCode(doc, invoice, templateConfig)
          .then(() => {
            this.addFooter(doc, tenant, invoice, templateConfig);
            doc.end();
          })
          .catch((err) => reject(err));
      } catch (err) {
        reject(err);
      }
    });
  }

  async renderThermal(invoice, tenant, options = {}) {
    const { width = 80, templateConfig = {} } = options;
    const mmToPoints = width === 58 ? 164 : 227;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: [mmToPoints, 1000],
          margin: 5,
          autoFirstPage: false,
        });
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.addPage();

        const x = 5;
        let y = 10;

        y = this.addThermalHeader(doc, tenant, x, y, mmToPoints, templateConfig);
        y = this.addThermalDivider(doc, x, y, mmToPoints);
        y = this.addThermalInvoiceDetails(doc, invoice, x, y, mmToPoints, templateConfig);
        y = this.addThermalDivider(doc, x, y, mmToPoints);
        y = this.addThermalItems(doc, invoice, x, y, mmToPoints, templateConfig);
        y = this.addThermalDivider(doc, x, y, mmToPoints);
        y = this.addThermalTotals(doc, invoice, x, y, mmToPoints);
        y = this.addThermalDivider(doc, x, y, mmToPoints);

        this.addThermalQRCode(doc, invoice, x, y, mmToPoints, templateConfig)
          .then(() => {
            y += 50;
            this.addThermalFooter(doc, tenant, x, y, mmToPoints, templateConfig);
            doc.end();
          })
          .catch((err) => reject(err));
      } catch (err) {
        reject(err);
      }
    });
  }

  addHeader(doc, tenant, invoice, templateConfig = {}) {
    const showLogo = templateConfig.showLogo !== false && templateConfig.logoUrl;

    // Note: We don't fetch remote logo URLs in this POC, but we leave the logic space
    const headerX = showLogo ? 110 : 50;

    doc
      .fillColor('#1a1a2e')
      .fontSize(22)
      .text(templateConfig.storeName || tenant.name || 'Pharmacy Name', headerX, 50)
      .fontSize(9)
      .fillColor('#666666')
      .text(tenant.address || '', headerX, 75)
      .text(`GSTIN: ${templateConfig.gstin || tenant.gstin || 'N/A'}`, headerX, 90)
      .text(`Phone: ${tenant.phone || 'N/A'}`, headerX, 105);

    doc.moveTo(50, 120).lineTo(550, 120).stroke();
  }

  addWatermark(doc, text) {
    doc
      .save()
      .fillColor('#ff0000')
      .fontSize(40)
      .opacity(0.15)
      .text(text, 150, 350, {
        align: 'center',
        width: 300,
        angle: 45,
      })
      .restore();
  }

  addInvoiceDetails(doc, invoice, templateConfig = {}) {
    doc
      .fontSize(11)
      .fillColor('#333333')
      .text(`Invoice: ${invoice.invoiceNumber}`, 50, 135)
      .text(
        `Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        50,
        150,
      )
      .text(`Payment Method: ${invoice.paymentMethod}`, 50, 165)
      .text(`Status: ${invoice.paymentStatus}`, 50, 180);

    if (invoice.patient && templateConfig.showPatientDetails !== false) {
      doc.text(`Patient: ${invoice.patient.fullName || 'Walk-in'}`, 350, 135);
      if (invoice.patient.phone) {
        doc.text(`Phone: ${invoice.patient.phone}`, 350, 150);
      }
    }

    if (invoice.prescription?.doctorName && templateConfig.showDoctorName !== false) {
      doc.text(`Doctor: ${invoice.prescription.doctorName}`, 350, 165);
    }
  }

  addItemsTable(doc, invoice, templateConfig = {}) {
    const tableTop = 240;
    const showHSN = templateConfig.showHSNCode !== false;
    const showBatch = templateConfig.showBatchNumber !== false;
    const showExpiry = templateConfig.showExpiryDate !== false;

    doc.fontSize(9).fillColor('#1a1a2e').font('Helvetica-Bold');

    let currentX = 50;
    doc.text('#', currentX, tableTop);
    currentX += 30;
    doc.text('Item', currentX, tableTop);
    currentX += 130;

    if (showHSN) {
      doc.text('HSN', currentX, tableTop);
      currentX += 50;
    }

    if (showBatch) {
      doc.text('Batch', currentX, tableTop);
      currentX += 70;
    }

    if (showExpiry) {
      doc.text('Exp', currentX, tableTop);
      currentX += 60;
    }

    doc.text('Qty', currentX, tableTop);
    currentX += 40;
    doc.text('Price', currentX, tableTop);
    currentX += 60;
    doc.text('Total', currentX, tableTop, { align: 'right', width: 60 });

    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    let y = tableTop + 25;
    invoice.items.forEach((item, idx) => {
      doc.fontSize(8).fillColor('#333333').font('Helvetica');
      let itemX = 50;

      doc.text(String(idx + 1), itemX, y);
      itemX += 30;

      doc.text(item.medicine?.name || 'Item', itemX, y, { width: 120 });
      itemX += 130;

      if (showHSN) {
        doc.text(item.medicine?.hsnCode || '-', itemX, y);
        itemX += 50;
      }

      if (showBatch) {
        doc.text(item.batch?.batchNumber || '-', itemX, y);
        itemX += 70;
      }

      if (showExpiry) {
        const exp = item.batch?.expiryDate
          ? new Date(item.batch.expiryDate).toLocaleDateString('en-IN', {
              month: '2-digit',
              year: '2-digit',
            })
          : '-';
        doc.text(exp, itemX, y);
        itemX += 60;
      }

      doc.text(String(item.quantity), itemX, y);
      itemX += 40;

      doc.text(`₹${item.unitPrice.toFixed(2)}`, itemX, y);
      itemX += 60;

      doc.text(`₹${item.totalPrice.toFixed(2)}`, itemX, y, {
        width: 60,
        align: 'right',
      });
      y += 18;

      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    });

    doc
      .moveTo(50, y + 5)
      .lineTo(550, y + 5)
      .stroke();
    return y + 15;
  }

  addTotals(doc, invoice) {
    const startY = doc.y + 10;
    const y = startY;
    doc.fontSize(10).fillColor('#333333');

    doc.text('Subtotal:', 380, y);
    doc.text(`₹${invoice.subtotal.toFixed(2)}`, 480, y, { align: 'right' });

    if (invoice.discountAmount > 0) {
      doc.text('Discount:', 380, y + 18);
      doc.text(`-₹${invoice.discountAmount.toFixed(2)}`, 480, y + 18, { align: 'right' });
    }

    doc.text('GST Amount:', 380, y + 36);
    doc.text(`₹${invoice.gstAmount.toFixed(2)}`, 480, y + 36, { align: 'right' });

    doc.fontSize(12).fillColor('#1a1a2e').font('Helvetica-Bold');
    doc.text('Grand Total:', 380, y + 58);
    doc.text(`₹${invoice.totalAmount.toFixed(2)}`, 480, y + 58, { align: 'right' });

    doc.fontSize(9).fillColor('#333333').font('Helvetica');
    doc.text(`Paid: ₹${invoice.paidAmount.toFixed(2)}`, 380, y + 80);
    if (invoice.balanceAmount > 0) {
      doc.text(`Balance: ₹${invoice.balanceAmount.toFixed(2)}`, 380, y + 95);
    }
  }

  addGSTBreakdown(doc, invoice) {
    const y = doc.y + 20;
    doc.fontSize(9).fillColor('#1a1a2e').font('Helvetica-Bold');
    doc.text('GST Breakdown', 50, y);
    doc.font('Helvetica');
    doc.fontSize(8).fillColor('#333333');
    doc.text(`CGST: ₹${(invoice.cgst || 0).toFixed(2)}`, 50, y + 15);
    doc.text(`SGST: ₹${(invoice.sgst || 0).toFixed(2)}`, 50, y + 28);
    doc.text(`IGST: ₹${(invoice.igst || 0).toFixed(2)}`, 50, y + 41);
  }

  async addQRCode(doc, invoice, templateConfig = {}) {
    if (templateConfig.showQRCode === false) return;

    try {
      const qrData = `${invoice.invoiceNumber}|${templateConfig.gstin || invoice.tenant?.gstNumber || 'NA'}|${invoice.totalAmount}`;

      const qrBuffer = await QRCode.toBuffer(qrData, { width: 80, margin: 1 });
      doc.image(qrBuffer, 470, doc.y - 40, { width: 70, height: 70 });
      doc
        .fontSize(7)
        .fillColor('#666666')
        .text('Scan to verify', 470, doc.y + 35, { width: 70, align: 'center' });
    } catch (err) {
      logger.warn(`[PDF] Failed to generate QR code: ${err.message}`);
    }
  }

  addFooter(doc, tenant, invoice, templateConfig = {}) {
    const footerY = 740;
    doc
      .fontSize(8)
      .fillColor('#666666')
      .text(templateConfig.footerText || 'This is a computer-generated invoice.', 50, footerY, {
        align: 'center',
        width: 500,
      })
      .text('Thank you for choosing Viyan MedAssist!', 50, footerY + 15, {
        align: 'center',
        width: 500,
      });

    if (invoice.notes) {
      doc.text(`Notes: ${invoice.notes}`, 50, footerY + 30, { width: 500 });
    }
  }

  addThermalHeader(doc, tenant, x, y, width, templateConfig = {}) {
    doc.fontSize(10).fillColor('#000000');
    doc.text(templateConfig.storeName || tenant.name || 'Pharmacy', x, y, {
      width: width - 10,
      align: 'center',
    });
    y += 14;
    doc.fontSize(7).text(tenant.address || '', x, y, { width: width - 10, align: 'center' });
    y += 10;
    doc.text(`GSTIN: ${templateConfig.gstin || tenant.gstin || 'N/A'}`, x, y, {
      width: width - 10,
      align: 'center',
    });
    y += 10;
    return y;
  }

  addThermalDivider(doc, x, y, width) {
    doc
      .moveTo(x, y)
      .lineTo(x + width - 10, y)
      .stroke();
    return y + 5;
  }

  addThermalInvoiceDetails(doc, invoice, x, y, width, templateConfig = {}) {
    doc.fontSize(7);
    doc.text(`Inv#: ${invoice.invoiceNumber}`, x, y);
    y += 9;
    doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN')}`, x, y);
    y += 9;
    doc.text(`Method: ${invoice.paymentMethod}`, x, y);
    y += 9;

    if (invoice.patient && templateConfig.showPatientDetails !== false) {
      doc.text(`Patient: ${invoice.patient.fullName || 'Walk-in'}`, x, y);
      y += 9;
    }

    return y;
  }

  addThermalItems(doc, invoice, x, y, width, templateConfig = {}) {
    doc.fontSize(7);
    const showBatch = templateConfig.showBatchNumber !== false;

    invoice.items.forEach((item) => {
      let itemLine = item.medicine?.name || 'Item';
      if (showBatch && item.batch?.batchNumber) {
        itemLine += ` (${item.batch.batchNumber})`;
      }
      doc.text(itemLine, x, y);
      y += 9;
      doc.text(
        `  ${item.quantity} x ₹${item.unitPrice.toFixed(2)} = ₹${item.totalPrice.toFixed(2)}`,
        x,
        y,
      );
      y += 10;
    });
    return y;
  }

  addThermalTotals(doc, invoice, x, y) {
    doc.fontSize(8);
    doc.text(`Subtotal: ₹${invoice.subtotal.toFixed(2)}`, x, y);
    y += 10;

    if (invoice.discountAmount > 0) {
      doc.text(`Discount: -₹${invoice.discountAmount.toFixed(2)}`, x, y);
      y += 10;
    }

    doc.text(`GST: ₹${invoice.gstAmount.toFixed(2)}`, x, y);
    y += 12;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(`TOTAL: ₹${invoice.totalAmount.toFixed(2)}`, x, y);
    doc.font('Helvetica');
    y += 12;
    return y;
  }

  async addThermalQRCode(doc, invoice, x, y, width, templateConfig = {}) {
    if (templateConfig.showQRCode === false) return;

    try {
      const qrData = invoice.invoiceNumber;
      const qrBuffer = await QRCode.toBuffer(qrData, { width: 60, margin: 1 });
      const qrX = x + (width - 70) / 2;
      doc.image(qrBuffer, qrX, y, { width: 60, height: 60 });
    } catch (err) {
      logger.warn(`[PDF] Failed to generate thermal QR: ${err.message}`);
    }
  }

  addThermalFooter(doc, tenant, x, y, width, templateConfig = {}) {
    doc.fontSize(7).fillColor('#333333');
    doc.text(templateConfig.footerText || 'Thank you!', x, y, {
      width: width - 10,
      align: 'center',
    });
    y += 10;
    doc.text('Powered by Viyan MedAssist', x, y, { width: width - 10, align: 'center' });
  }
}

export default new PdfRendererService();
