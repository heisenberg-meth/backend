import ExcelJS from 'exceljs';
import gstRepository from '../repositories/gst.repository.js';
import logger from '../../../shared/utils/logger.js';

class GstReportService {
  async generateReport(tenantId, options = {}) {
    const { month, year, format = 'xlsx' } = options;

    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59, 999);

    const [summary, hsnSummaries, inputTax] = await Promise.all([
      gstRepository.getAggregatedGst(tenantId, from.toISOString(), to.toISOString()),
      gstRepository.findHsnSummaries(tenantId, {
        from: from.toISOString(),
        to: to.toISOString(),
      }),
      gstRepository.getInputTaxCredit(tenantId, from.toISOString(), to.toISOString()),
    ]);

    if (format === 'csv') {
      return this.generateCsv(summary, hsnSummaries, inputTax, month, year);
    }

    if (format === 'json') {
      return {
        reportData: { summary, hsnSummaries, inputTax },
        generatedAt: new Date().toISOString(),
      };
    }

    return this.generateXlsx(summary, hsnSummaries, inputTax, month, year);
  }

  async generateXlsx(summary, hsnSummaries, inputTax, month, year) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Viyan MedAssist';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('GST Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Amount (₹)', key: 'amount', width: 20 },
    ];

    summarySheet.addRows([
      { metric: 'Taxable Amount', amount: summary.taxableAmount },
      { metric: 'CGST Collected', amount: summary.cgstTotal },
      { metric: 'SGST Collected', amount: summary.sgstTotal },
      { metric: 'IGST Collected', amount: summary.igstTotal },
      { metric: 'Total GST Collected', amount: summary.gstCollected },
      { metric: 'Input Tax Credit', amount: inputTax.totalInputGst },
      {
        metric: 'Net GST Payable',
        amount: parseFloat((summary.gstCollected - inputTax.totalInputGst).toFixed(2)),
      },
    ]);

    summarySheet.getRow(1).font = { bold: true };

    const hsnSheet = workbook.addWorksheet('HSN Summary');
    hsnSheet.columns = [
      { header: 'HSN Code', key: 'hsnCode', width: 15 },
      { header: 'Description', key: 'description', width: 30 },
      { header: 'Taxable Value', key: 'taxableValue', width: 20 },
      { header: 'Total GST', key: 'totalGst', width: 20 },
      { header: 'Quantity', key: 'totalQuantity', width: 15 },
    ];

    hsnSummaries.forEach((h) =>
      hsnSheet.addRow({
        hsnCode: h.hsnCode,
        description: h.medicineName || '',
        taxableValue: h.taxableValue,
        totalGst: h.totalGst,
        totalQuantity: h.totalQuantity,
      }),
    );

    hsnSheet.getRow(1).font = { bold: true };

    const inputSheet = workbook.addWorksheet('Input Tax Credit');
    inputSheet.columns = [
      { header: 'Metric', key: 'metric', width: 25 },
      { header: 'Amount (₹)', key: 'amount', width: 20 },
    ];

    inputSheet.addRows([
      { metric: 'Total Input GST', amount: inputTax.totalInputGst },
      { metric: 'Total Purchases', amount: inputTax.totalPurchaseAmount },
      { metric: 'Purchase Invoices', amount: inputTax.invoiceCount },
    ]);

    inputSheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `gst-report-${month}-${year}.xlsx`;

    logger.info(`[GST Report] Generated ${filename}`);

    return {
      buffer: Buffer.from(buffer),
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async generateCsv(summary, hsnSummaries, inputTax, month, year) {
    const lines = [];

    lines.push('GST Summary Report');
    lines.push(`Period: ${month}/${year}`);
    lines.push('');
    lines.push('Metric,Amount (₹)');
    lines.push(`Taxable Amount,${summary.taxableAmount}`);
    lines.push(`CGST Collected,${summary.cgstTotal}`);
    lines.push(`SGST Collected,${summary.sgstTotal}`);
    lines.push(`IGST Collected,${summary.igstTotal}`);
    lines.push(`Total GST Collected,${summary.gstCollected}`);
    lines.push(`Input Tax Credit,${inputTax.totalInputGst}`);
    lines.push(
      `Net GST Payable,${parseFloat((summary.gstCollected - inputTax.totalInputGst).toFixed(2))}`,
    );
    lines.push('');
    lines.push('HSN Code,Description,Taxable Value,Total GST,Quantity');

    hsnSummaries.forEach((h) => {
      lines.push(
        `${h.hsnCode},${h.medicineName || ''},${h.taxableValue},${h.totalGst},${h.totalQuantity}`,
      );
    });

    const csv = lines.join('\n');
    const filename = `gst-report-${month}-${year}.csv`;

    return {
      buffer: Buffer.from(csv, 'utf-8'),
      filename,
      contentType: 'text/csv',
    };
  }
}

export default new GstReportService();
