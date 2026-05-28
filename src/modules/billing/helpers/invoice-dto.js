export function normalizeInvoice(invoice) {
  if (!invoice) return null;

  const items = (invoice.items || []).map(item => ({
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
    batchNumber: item.batch?.batchNumber || 'N/A'
  }));

  const patient = invoice.patient ? {
    id: invoice.patient.id,
    name: invoice.patient.fullName || invoice.patient.name,
    phone: invoice.patient.phone
  } : null;

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber || invoice.billNumber || `INV-${invoice.id.slice(0, 8)}`,
    date: invoice.createdAt || invoice.soldAt || new Date().toISOString(),
    status: invoice.status,
    paymentStatus: invoice.paymentStatus,
    paymentMethod: invoice.paymentMethod || (invoice.payments && invoice.payments[0]?.paymentMode) || 'CASH',
    patient,
    patientName: patient?.name || 'Walk-in Customer',
    patientPhone: patient?.phone || 'N/A',
    items,
    subtotal: Number(invoice.subtotal || 0),
    discount: Number(invoice.discountAmount || 0),
    gst: Number(invoice.gstAmount || 0),
    total: Number(invoice.totalAmount || 0),
    paidAmount: Number(invoice.paidAmount || 0),
    balanceAmount: Number(invoice.balanceAmount || 0),
    notes: invoice.notes,
    pdfUrl: invoice.pdfUrl
  };
}
