import PDFDocument from 'pdfkit';

function formatDateForPdf(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export function generatePdfReport(records, { fromDate, toDate, paymentMethod, status, search }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const buffers = [];

      doc.on('data', (data) => buffers.push(data));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Header Title
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor('#111827')
        .text('MEDASSIST', { align: 'left' });
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#374151')
        .text('SALES REPORT', { align: 'left' })
        .moveDown(0.5);

      // Report Period
      const periodStr = `${formatDateForPdf(fromDate)} - ${formatDateForPdf(toDate)}`;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#4B5563')
        .text(`Period: ${periodStr}`, { align: 'left' });

      // Filters summary
      const activeFilters = [];
      if (paymentMethod && paymentMethod !== 'ALL') activeFilters.push(`Payment: ${paymentMethod}`);
      if (status && status !== 'ALL') activeFilters.push(`Status: ${status}`);
      if (search && search.trim() !== '') activeFilters.push(`Search: "${search.trim()}"`);

      if (activeFilters.length > 0) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(9)
          .fillColor('#6B7280')
          .text(`Filters: ${activeFilters.join(' | ')}`);
      }

      doc.moveDown(1);

      // Empty state
      if (!records || records.length === 0) {
        doc
          .font('Helvetica')
          .fontSize(11)
          .fillColor('#6B7280')
          .text('No sales records found for the selected filters.', { align: 'center' });
        doc.end();
        return;
      }

      // Table Setup
      const columns = [
        { header: 'Invoice No', width: 75, align: 'left' },
        { header: 'Date', width: 65, align: 'left' },
        { header: 'Patient', width: 85, align: 'left' },
        { header: 'Payment Method', width: 70, align: 'left' },
        { header: 'Status', width: 50, align: 'left' },
        { header: 'Subtotal', width: 45, align: 'right' },
        { header: 'GST', width: 40, align: 'right' },
        { header: 'Discount', width: 45, align: 'right' },
        { header: 'Total', width: 40, align: 'right' },
      ];

      const startX = 40;
      let y = doc.y;

      // Table Headers
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827');
      let currentX = startX;
      columns.forEach((col) => {
        doc.text(col.header, currentX, y, { width: col.width, align: col.align });
        currentX += col.width;
      });

      y += 15;
      doc.moveTo(startX, y).lineTo(555, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
      y += 5;

      // Rows
      doc.font('Helvetica').fontSize(8).fillColor('#374151');
      records.forEach((row) => {
        if (y > 750) {
          doc.addPage();
          y = 40;

          doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827');
          let headerX = startX;
          columns.forEach((col) => {
            doc.text(col.header, headerX, y, { width: col.width, align: col.align });
            headerX += col.width;
          });
          y += 15;
          doc.moveTo(startX, y).lineTo(555, y).strokeColor('#E5E7EB').lineWidth(1).stroke();
          y += 5;
          doc.font('Helvetica').fontSize(8).fillColor('#374151');
        }

        let cellX = startX;
        const rowData = [
          row.invoiceNo,
          row.date,
          row.patient,
          row.paymentMethod,
          row.status,
          row.subtotal,
          row.gst,
          row.discount,
          row.total,
        ];

        columns.forEach((col, idx) => {
          doc.text(rowData[idx] || '', cellX, y, {
            width: col.width,
            align: col.align,
            ellipsis: true,
          });
          cellX += col.width;
        });

        y += 14;
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
