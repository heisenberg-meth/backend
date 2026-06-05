export function renderInvoiceEmail(invoiceData, tenantName, branding) {
  const date = new Date(invoiceData.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const itemsHtml = (invoiceData.items || [])
    .map(
      (item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.medicine?.name || 'Item'}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.unitPrice.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.totalPrice.toFixed(2)}</td>
        </tr>`,
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
  .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
  .header { background: #1a1a2e; color: #fff; padding: 24px; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .header p { margin: 8px 0 0; opacity: 0.8; }
  .content { padding: 24px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .info-item { background: #f8f9fa; padding: 12px; border-radius: 4px; }
  .info-label { font-size: 12px; color: #666; margin-bottom: 4px; }
  .info-value { font-size: 14px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f8f9fa; text-align: left; padding: 10px 8px; font-size: 12px; color: #666; }
  td { font-size: 13px; }
  .totals { background: #f8f9fa; padding: 16px; border-radius: 4px; }
  .total-row { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand-total { font-size: 18px; font-weight: bold; color: #1a1a2e; border-top: 2px solid #1a1a2e; padding-top: 8px; margin-top: 8px; }
  .footer { background: #f8f9fa; padding: 16px; text-align: center; font-size: 12px; color: #666; }
  .gst-table { width: 100%; margin-top: 16px; }
  .gst-table td { padding: 4px 8px; font-size: 12px; }
</style></head>
<body>
<div class="container">
  <div class="header">
    <h1>${branding?.logoText || tenantName || 'Viyan MedAssist'}</h1>
    <p>${branding?.tagline || 'Your trusted pharmacy partner'}</p>
  </div>
  <div class="content">
    <h2 style="margin-top: 0;">Invoice ${invoiceData.invoiceNumber}</h2>
    <div class="info-grid">
      <div class="info-item"><div class="info-label">Invoice Date</div><div class="info-value">${date}</div></div>
      <div class="info-item"><div class="info-label">Payment Method</div><div class="info-value">${invoiceData.paymentMethod}</div></div>
      <div class="info-item"><div class="info-label">Payment Status</div><div class="info-value">${invoiceData.paymentStatus}</div></div>
      <div class="info-item"><div class="info-label">GSTIN</div><div class="info-value">${invoiceData.tenant?.gstin || 'N/A'}</div></div>
    </div>
    <table><thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Price</th><th style="text-align:right;">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>
    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>₹${invoiceData.subtotal.toFixed(2)}</span></div>
      <div class="total-row"><span>Discount</span><span>-₹${invoiceData.discountAmount.toFixed(2)}</span></div>
      <div class="total-row"><span>GST Amount</span><span>₹${invoiceData.gstAmount.toFixed(2)}</span></div>
      <div class="total-row grand-total"><span>Grand Total</span><span>₹${invoiceData.totalAmount.toFixed(2)}</span></div>
    </div>
    <table class="gst-table">
      <tr><td>CGST</td><td>₹${(invoiceData.cgst || 0).toFixed(2)}</td></tr>
      <tr><td>SGST</td><td>₹${(invoiceData.sgst || 0).toFixed(2)}</td></tr>
      <tr><td>IGST</td><td>₹${(invoiceData.igst || 0).toFixed(2)}</td></tr>
    </table>
    ${invoiceData.patient ? `<p style="margin-top:16px;"><strong>Patient:</strong> ${invoiceData.patient.fullName || 'Walk-in'}</p>` : ''}
    ${invoiceData.notes ? `<p style="margin-top:8px;"><strong>Notes:</strong> ${invoiceData.notes}</p>` : ''}
  </div>
  <div class="footer"><p>This is a computer-generated invoice. Please find the PDF invoice attached.</p><p>Powered by Viyan MedAssist</p></div>
</div>
</body>
</html>`;
}
