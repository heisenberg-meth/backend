import ExcelJS from 'exceljs';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class GstExportService {
  async exportGstFiling(tenantId, options = {}) {
    const { month, year, format = 'xlsx' } = options;
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59, 999);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
        deletedAt: null,
      },
      include: {
        items: {
          include: {
            medicine: { select: { hsnCode: true, name: true } },
            batch: { select: { batchNumber: true } },
          },
        },
        branch: { select: { gstNumber: true, name: true } },
        patient: { select: { fullName: true, gstNumber: true } },
      },
    });

    if (format === 'csv') {
      return this.generateCsv(invoices, month, year);
    }

    if (format === 'json') {
      return { data: this.formatFilingData(invoices), generatedAt: new Date().toISOString() };
    }

    return this.generateXlsx(invoices, month, year);
  }

  formatFilingData(invoices) {
    return invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.createdAt,
      customerName: inv.patient?.fullName || 'Walk-in',
      customerGstin: inv.patient?.gstNumber || '',
      branchGstin: inv.branch?.gstNumber || '',
      taxableValue: Number(inv.subtotal),
      cgst: Number(inv.cgst || 0),
      sgst: Number(inv.sgst || 0),
      igst: Number(inv.igst || 0),
      totalGst: Number(inv.gstAmount),
      totalAmount: Number(inv.totalAmount),
      items: inv.items.map((item) => ({
        name: item.medicine?.name,
        hsn: item.medicine?.hsnCode,
        batch: item.batch?.batchNumber,
        quantity: item.quantity,
        rate: Number(item.unitPrice),
        taxable: Number(item.unitPrice) * item.quantity,
        gstRate: Number(item.gstPercentage),
      })),
    }));
  }

  async generateXlsx(invoices, month, year) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Viyan MedAssist GST Filing';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('GST Filing');
    sheet.columns = [
      { header: 'Invoice #', key: 'invNo', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Customer GSTIN', key: 'custGst', width: 20 },
      { header: 'Branch GSTIN', key: 'branchGst', width: 20 },
      { header: 'HSN', key: 'hsn', width: 12 },
      { header: 'Item', key: 'item', width: 25 },
      { header: 'Batch', key: 'batch', width: 15 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Rate', key: 'rate', width: 12 },
      { header: 'Taxable', key: 'taxable', width: 14 },
      { header: 'GST%', key: 'gstPct', width: 8 },
      { header: 'CGST', key: 'cgst', width: 12 },
      { header: 'SGST', key: 'sgst', width: 12 },
      { header: 'IGST', key: 'igst', width: 12 },
      { header: 'Total', key: 'total', width: 14 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const inv of invoices) {
      for (const item of inv.items) {
        sheet.addRow({
          invNo: inv.invoiceNumber,
          date: inv.createdAt.toISOString().slice(0, 10),
          customer: inv.patient?.fullName || 'Walk-in',
          custGst: inv.patient?.gstNumber || '',
          branchGst: inv.branch?.gstNumber || '',
          hsn: item.medicine?.hsnCode || '',
          item: item.medicine?.name || '',
          batch: item.batch?.batchNumber || '',
          qty: item.quantity,
          rate: Number(item.unitPrice),
          taxable: Number(item.unitPrice) * item.quantity,
          gstPct: Number(item.gstPercentage),
          cgst: Number(item.cgst || 0),
          sgst: Number(item.sgst || 0),
          igst: Number(item.igst || 0),
          total: Number(item.totalPrice),
        });
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `gst-filing-${month}-${year}.xlsx`;

    logger.info(`[GST Export] Generated filing export: ${filename} (${invoices.length} invoices)`);

    return {
      buffer: Buffer.from(buffer),
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      invoiceCount: invoices.length,
    };
  }

  async generateCsv(invoices, month, year) {
    const lines = [
      'Invoice #,Date,Customer,Customer GSTIN,Branch GSTIN,HSN,Item,Batch,Qty,Rate,Taxable,GST%,CGST,SGST,IGST,Total',
    ];

    for (const inv of invoices) {
      for (const item of inv.items) {
        lines.push(
          [
            inv.invoiceNumber,
            inv.createdAt.toISOString().slice(0, 10),
            `"${inv.patient?.fullName || 'Walk-in'}"`,
            inv.patient?.gstNumber || '',
            inv.branch?.gstNumber || '',
            item.medicine?.hsnCode || '',
            `"${item.medicine?.name || ''}"`,
            item.batch?.batchNumber || '',
            item.quantity,
            Number(item.unitPrice),
            Number(item.unitPrice) * item.quantity,
            Number(item.gstPercentage),
            Number(item.cgst || 0),
            Number(item.sgst || 0),
            Number(item.igst || 0),
            Number(item.totalPrice),
          ].join(','),
        );
      }
    }

    const csv = lines.join('\n');
    return {
      buffer: Buffer.from(csv, 'utf-8'),
      filename: `gst-filing-${month}-${year}.csv`,
      contentType: 'text/csv',
      invoiceCount: invoices.length,
    };
  }
}

export default new GstExportService();
