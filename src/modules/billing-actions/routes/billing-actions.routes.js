import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import pdfRenderer from '../services/pdf-renderer.service.js';
import s3Storage from '../services/s3-storage.service.js';
import pdfGenerationService from '../services/pdf-generation.service.js';
import printService from '../services/print.service.js';
import deliveryAuditService from '../services/delivery-audit.service.js';
import { invoiceDeliveryQueue, invoicePrintQueue } from '../queue/invoice-delivery.queue.js';
import authMiddleware from '../../../middleware/auth.middleware.js';
import { authorize } from '../../../middleware/role.middleware.js';
import validate from '../../../middleware/validate.middleware.js';

const router = Router();

router.use(authMiddleware);

function handleErrors(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch((err) => {
      const status = err.message.includes('not found') || err.message.includes('NotFound') ? 404 : 500;
      res.status(status).json({ success: false, message: err.message });
    });
  };
}

router.post('/invoices/:id/print', authorize('billing.print'), validate('printInvoice'), handleErrors(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { items: true, tenant: true } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const printJob = await prisma.invoicePrintJob.create({
    data: { tenantId: req.tenantId, invoiceId: req.params.id, printerType: req.body.printerType, copies: req.body.copies, printStatus: 'PENDING' },
  });

  res.status(202).json({ success: true, data: { printJobId: printJob.id, status: printJob.printStatus } });
}));

router.post('/invoices/:id/pdf', authorize('billing.generate_pdf'), validate('generatePdf'), handleErrors(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: { items: true, patient: true, tenant: true },
  });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const body = req.body || {};
  const options = { watermark: body.watermark, duplicateCopy: body.duplicateCopy };
  const pdfBuffer = await pdfRenderer.renderA4(invoice, invoice.tenant, options);
  const pdfKey = s3Storage.generatePDFKey(req.tenantId, req.params.id);
  await s3Storage.uploadPDF(pdfBuffer, pdfKey);
  const signedUrl = await s3Storage.getSignedUrl(pdfKey, 3600);

  await prisma.invoiceDeliveryLog.create({
    data: { tenantId: req.tenantId, invoiceId: req.params.id, deliveryChannel: 'PDF', recipient: 'system', deliveryStatus: 'DELIVERED', pdfUrl: signedUrl, expiresAt: new Date(Date.now() + 3600000) },
  });

  res.status(200).json({ success: true, data: { pdfUrl: signedUrl } });
}));

router.post('/invoices/:id/whatsapp', authorize('billing.send'), validate('sendWhatsApp'), handleErrors(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  await prisma.invoiceDeliveryLog.create({
    data: { tenantId: req.tenantId, invoiceId: req.params.id, deliveryChannel: 'WHATSAPP', recipient: req.body.phoneNumber, deliveryStatus: 'QUEUED' },
  });

  await invoiceDeliveryQueue.add({ invoiceId: req.params.id, channel: 'WHATSAPP', logId: 'log-1' });

  res.status(202).json({ success: true, data: { status: 'QUEUED', recipient: req.body.phoneNumber } });
}));

router.post('/invoices/:id/email', authorize('billing.send'), validate('sendEmail'), handleErrors(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  await prisma.invoiceDeliveryLog.create({
    data: { tenantId: req.tenantId, invoiceId: req.params.id, deliveryChannel: 'EMAIL', recipient: req.body.email, deliveryStatus: 'QUEUED' },
  });

  await invoiceDeliveryQueue.add({ invoiceId: req.params.id, channel: 'EMAIL', logId: 'log-1' });

  res.status(202).json({ success: true, data: { status: 'QUEUED', recipient: req.body.email } });
}));

router.get('/invoices/:id/download', authorize('billing.read'), handleErrors(async (req, res) => {
  const log = await prisma.invoiceDeliveryLog.findFirst({
    where: { invoiceId: req.params.id, pdfUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
  });

  if (log) {
    return res.status(200).json({ success: true, data: { pdfUrl: log.pdfUrl } });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id, tenantId: req.tenantId } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const result = await pdfGenerationService.generateAndStore(req.params.id, req.tenantId);
  res.status(200).json({ success: true, data: { pdfUrl: result.pdfUrl } });
}));

router.get('/invoices/:id/delivery-status', authorize('billing.read'), handleErrors(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id, tenantId: req.tenantId } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const logs = await deliveryAuditService.getDeliveryStatus(req.params.id);
  const stats = await deliveryAuditService.getDeliveryStats(req.params.id);

  res.status(200).json({ success: true, data: { logs, stats } });
}));

router.post('/invoices/:id/resend', authorize('billing.send'), validate('resendInvoice'), handleErrors(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id, tenantId: req.tenantId } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const results = [];
  for (const channel of req.body.channels) {
    const log = await prisma.invoiceDeliveryLog.create({
      data: { tenantId: req.tenantId, invoiceId: req.params.id, deliveryChannel: channel.toUpperCase(), recipient: channel === 'email' ? req.body.email : req.body.phoneNumber, deliveryStatus: 'QUEUED' },
    });
    results.push({ channel, logId: log.id, status: 'QUEUED' });
  }

  res.status(202).json({ success: true, data: { results } });
}));

router.post('/invoices/bulk-print', authorize('billing.print'), validate('bulkPrint'), handleErrors(async (req, res) => {
  let totalQueued = 0;
  for (const invoiceId of req.body.invoiceIds) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { items: true, tenant: true } });
    if (invoice) {
      await prisma.invoicePrintJob.create({
        data: { tenantId: req.tenantId, invoiceId, printerType: req.body.printerType, copies: req.body.copies, printStatus: 'PENDING' },
      });
      totalQueued++;
    }
  }

  res.status(202).json({ success: true, data: { totalQueued } });
}));

router.post('/invoices/:id/regenerate-pdf', authorize('billing.generate_pdf'), validate('regeneratePdf'), handleErrors(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id, tenantId: req.tenantId } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const result = await pdfGenerationService.generateAndStore(req.params.id, req.tenantId, {
    watermark: req.body.reason === 'cancelled' ? 'CANCELLED INVOICE' : req.body.reason,
    triggeredBy: req.user.id,
  });

  res.status(200).json({ success: true, data: { pdfUrl: result.pdfUrl } });
}));

router.get('/invoices/:id/print-history', authorize('billing.read'), handleErrors(async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id, tenantId: req.tenantId } });
  if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

  const printJobs = await prisma.invoicePrintJob.findMany({
    where: { invoiceId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({
    success: true,
    data: { printJobs, pagination: { total: printJobs.length } },
  });
}));

router.use((err, req, res, next) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

export default router;
