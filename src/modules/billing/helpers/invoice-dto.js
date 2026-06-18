export function normalizeInvoice(invoice) {
  if (!invoice) return null;

  const items = (invoice.items || []).map((item) => ({
    id: item.id || item.medicineId,
    medicineId: item.medicineId,
    medicineName: item.medicine?.name || item.medicineName || item.name || 'Unknown',
    name: item.medicine?.name || item.medicineName || item.name || 'Unknown',
    qty: Number(item.quantity || 0),
    quantity: Number(item.quantity || 0),
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
    invoiceNumber:
      invoice.invoiceNumber ||
      invoice.invoice?.invoiceNumber ||
      invoice.billNumber ||
      invoice.invoice?.billNumber ||
      `INV-${invoice.id.slice(0, 8)}`,
    createdAt: timestamp.toISOString(),
    date: timestamp.toISOString().split('T')[0],
    time: timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
    status: invoice.status,
    invoiceStatus: invoice.status,
    paymentStatus: invoice.paymentStatus,
    paymentMode:
      invoice.paymentMethod ||
      invoice.paymentMode ||
      (invoice.payments && invoice.payments[0]?.paymentMode) ||
      'CASH',
    paymentMethod:
      invoice.paymentMethod ||
      invoice.paymentMode ||
      (invoice.payments && invoice.payments[0]?.paymentMode) ||
      'CASH',
    patient,
    patientName: patient?.name || invoice.patientName || invoice.customerName || 'Walk-in Customer',
    patientPhone: patient?.phone || invoice.patientPhone || invoice.phone || 'N/A',
    phone: patient?.phone || invoice.patientPhone || invoice.phone || 'N/A',
    items,
    subtotal: Number(invoice.subtotal || 0),
    discountAmount: Number(invoice.discountAmount || 0),
    discount: Number(invoice.discountAmount || 0),
    gstAmount: Number(invoice.gstAmount || 0),
    gst: Number(invoice.gstAmount || 0),
    totalAmount: Number(invoice.totalAmount || 0),
    total: Number(invoice.totalAmount || 0),
    paidAmount: Number(invoice.paidAmount || 0),
    balanceAmount: Number(invoice.balanceAmount || 0),
    returnedAmount: Number(invoice.returnedAmount || 0),
    returnCount: Number(invoice.returnCount || 0),
    notes: invoice.notes,
    pdfUrl: invoice.pdfUrl,
  };
}
