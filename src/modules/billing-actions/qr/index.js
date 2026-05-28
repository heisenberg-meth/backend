import crypto from 'crypto';

export function generateInvoiceQRData(invoice, secretKey) {
  const payload = {
    invoiceNumber: invoice.invoiceNumber,
    gstin: invoice.tenant?.gstNumber || '',
    totalAmount: Number(invoice.totalAmount),
    date: invoice.createdAt.toISOString(),
  };

  const payloadStr = JSON.stringify(payload);
  const hash = secretKey
    ? crypto.createHmac('sha256', secretKey).update(payloadStr).digest('hex')
    : crypto.createHash('sha256').update(payloadStr).digest('hex');

  return `${payloadStr}|${hash}`;
}

export function verifyInvoiceQR(qrData, secretKey) {
  const lastPipeIndex = qrData.lastIndexOf('|');
  if (lastPipeIndex === -1) return false;

  const payloadStr = qrData.substring(0, lastPipeIndex);
  const receivedHash = qrData.substring(lastPipeIndex + 1);

  const expectedHash = secretKey
    ? crypto.createHmac('sha256', secretKey).update(payloadStr).digest('hex')
    : crypto.createHash('sha256').update(payloadStr).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(receivedHash), Buffer.from(expectedHash));
}
