import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

class ExportService {
  async exportToExcel(data, columns, worksheetName = 'Report') {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(worksheetName);

    worksheet.columns = columns.map(col => ({
      header: col.header,
      key: col.key,
      width: col.width || 15
    }));

    worksheet.addRows(data);

    // Styling
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    return workbook.xlsx.writeBuffer();
  }

  async exportToPdf(title, data, columns) {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc.fontSize(20).text(title, { align: 'center' }).moveDown();

      // Table mapping
      const tableTop = 150;
      let y = tableTop;

      // Headers
      columns.forEach((col, i) => {
        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(col.header, 50 + i * 80, y);
      });

      y += 20;
      doc
        .moveTo(50, y - 5)
        .lineTo(550, y - 5)
        .stroke();

      // Rows
      doc.font('Helvetica');
      data.forEach((row) => {
        if (y > 750) {
          doc.addPage();
          y = 50;
        }
        columns.forEach((col, i) => {
          const val = row[col.key];
          doc.fontSize(9).text(val ? val.toString() : '', 50 + i * 80, y);
        });
        y += 20;
      });

      doc.end();
    });
  }
}

export default new ExportService();
