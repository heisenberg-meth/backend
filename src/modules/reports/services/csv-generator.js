function escapeCsvValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvReport(records) {
  const headers = [
    'Invoice No',
    'Date',
    'Patient',
    'Payment Method',
    'Status',
    'Subtotal',
    'GST',
    'Discount',
    'Total',
  ];

  const headerLine = headers.join(',');

  if (!records || records.length === 0) {
    return headerLine + '\n';
  }

  const rows = records.map((rec) =>
    [
      escapeCsvValue(rec.invoiceNo),
      escapeCsvValue(rec.date),
      escapeCsvValue(rec.patient),
      escapeCsvValue(rec.paymentMethod),
      escapeCsvValue(rec.status),
      escapeCsvValue(rec.subtotal),
      escapeCsvValue(rec.gst),
      escapeCsvValue(rec.discount),
      escapeCsvValue(rec.total),
    ].join(','),
  );

  return [headerLine, ...rows].join('\n') + '\n';
}
