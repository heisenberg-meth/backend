export function renderInvoiceWhatsappMessage(invoiceData, pdfUrl) {
  const lines = [
    `*Invoice ${invoiceData.invoiceNumber}*`,
    `Amount: ₹${invoiceData.totalAmount?.toFixed(2)}`,
    `Status: ${invoiceData.paymentStatus}`,
  ];

  if (pdfUrl) {
    lines.push(`\nDownload: ${pdfUrl}`);
  }

  lines.push('\nThank you for choosing Viyan MedAssist!');
  return lines.join('\n');
}

export function renderPaymentConfirmationMessage(invoiceData) {
  return [
    `*Payment Received* for Invoice ${invoiceData.invoiceNumber}`,
    `Invoice: ${invoiceData.invoiceNumber}`,
    `Amount: ₹${invoiceData.totalAmount?.toFixed(2)}`,
    '\nThank you for your payment!',
  ].join('\n');
}

export const INVOICE_TEMPLATE_NAME = 'invoice_delivery';
