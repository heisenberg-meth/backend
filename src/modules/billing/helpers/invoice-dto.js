export function normalizeInvoice(invoice) {
  if (!invoice) return null;

  const items = (invoice.items || []).map((item) => ({
    id: item.id || item.medicineId,
    medicineId: item.medicineId,
    name: item.medicine?.name || item.medicineName || 'Unknown',
    qty: Number(item.quantity || 0),
    price: Number(item.unitPrice || 0),
    mrp: Number(item.mrp || item.unitPrice || 0),
    gst: Number(item.gstPercentage || 0),
    gstAmount: Number(item.gstAmount || 0),
    total: Number(item.totalPrice || item.totalAmount || 0),
    batchId: item.batchId,
    batchNumber: item.batch?.batchNumber || 'N/A',
  }));

  const patient = invoice.patient
    ? {
        id: invoice.patient.id,
        name: invoice.patient.fullName || invoice.patient.name,
        phone: invoice.patient.phone,
      }
    : null;

  const safeTimestamp = (val) => {
    if (!val) return new Date();
    const date = new Date(val);
    return isNaN(date.getTime()) ? new Date() : date;
  };

  const timestamp = safeTimestamp(invoice.createdAt || invoice.soldAt);

  return {
    id: invoice.id,
    invoiceId: invoice.invoiceId || invoice.id,
    invoiceNumber: invoice.invoiceNumber || invoice.billNumber || `INV-${invoice.id.slice(0, 8)}`,
    createdAt: timestamp.toISOString(),
    date: timestamp.toISOString().split('T')[0],
    time: timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
    status: invoice.status,
    paymentStatus: invoice.paymentStatus,
    paymentMethod:
      invoice.paymentMethod || (invoice.payments && invoice.payments[0]?.paymentMode) || 'CASH',
    patient,
    patientName: patient?.name || invoice.patientName || 'Walk-in Customer',
    patientPhone: patient?.phone || invoice.patientPhone || 'N/A',
    items,
    subtotal: Number(invoice.subtotal || 0),
    discount: Number(invoice.discountAmount || 0),
    gst: Number(invoice.gstAmount || 0),
    total: Number(invoice.totalAmount || 0),
    paidAmount: Number(invoice.paidAmount || 0),
    balanceAmount: Number(invoice.balanceAmount || 0),
    notes: invoice.notes,
    pdfUrl: invoice.pdfUrl,
  };
}
