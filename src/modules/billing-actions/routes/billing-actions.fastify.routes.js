import prisma from '../../../config/prisma.js';
import pdfRenderer from '../services/pdf-renderer.service.js';
import s3Storage from '../services/s3-storage.service.js';
import pdfGenerationService from '../services/pdf-generation.service.js';
import deliveryAuditService from '../services/delivery-audit.service.js';
import { invoiceDeliveryQueue } from '../queue/invoice-delivery.queue.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function billingActionsFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post(
    '/invoices/:id/print',
    {
      schema: { tags: ['Billing'], summary: 'Print invoice' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    async (request, reply) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: request.params.id },
        include: { items: true, tenant: true },
      });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      const printJob = await prisma.invoicePrintJob.create({
        data: {
          tenantId: request.tenantId,
          invoiceId: request.params.id,
          printerType: request.body.printerType,
          copies: request.body.copies,
          printStatus: 'PENDING',
        },
      });

      return reply
        .code(202)
        .send({ success: true, data: { printJobId: printJob.id, status: printJob.printStatus } });
    },
  );

  fastify.post(
    '/invoices/:id/pdf',
    {
      schema: { tags: ['Billing'], summary: 'Generate invoice PDF' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    async (request, reply) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: request.params.id },
        include: { items: true, patient: true, tenant: true },
      });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      const options = {
        watermark: request.body.watermark,
        duplicateCopy: request.body.duplicateCopy,
      };
      const pdfBuffer = await pdfRenderer.renderA4(invoice, invoice.tenant, options);
      const pdfKey = s3Storage.generatePDFKey(request.tenantId, request.params.id);
      await s3Storage.uploadPDF(pdfBuffer, pdfKey);
      const signedUrl = await s3Storage.getSignedUrl(pdfKey, 3600);

      await prisma.invoiceDeliveryLog.create({
        data: {
          tenantId: request.tenantId,
          invoiceId: request.params.id,
          deliveryChannel: 'PDF',
          recipient: 'system',
          deliveryStatus: 'DELIVERED',
          pdfUrl: signedUrl,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      return reply.send({ success: true, data: { pdfUrl: signedUrl } });
    },
  );

  fastify.post(
    '/invoices/:id/whatsapp',
    {
      schema: { tags: ['Billing'], summary: 'Send invoice via WhatsApp' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    async (request, reply) => {
      const invoice = await prisma.invoice.findUnique({ where: { id: request.params.id } });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      await prisma.invoiceDeliveryLog.create({
        data: {
          tenantId: request.tenantId,
          invoiceId: request.params.id,
          deliveryChannel: 'WHATSAPP',
          recipient: request.body.phoneNumber,
          deliveryStatus: 'QUEUED',
        },
      });

      await invoiceDeliveryQueue.add({
        invoiceId: request.params.id,
        channel: 'WHATSAPP',
        logId: 'log-1',
      });

      return reply
        .code(202)
        .send({ success: true, data: { status: 'QUEUED', recipient: request.body.phoneNumber } });
    },
  );

  fastify.post(
    '/invoices/:id/email',
    {
      schema: { tags: ['Billing'], summary: 'Send invoice via email' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    async (request, reply) => {
      const invoice = await prisma.invoice.findUnique({ where: { id: request.params.id } });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      await prisma.invoiceDeliveryLog.create({
        data: {
          tenantId: request.tenantId,
          invoiceId: request.params.id,
          deliveryChannel: 'EMAIL',
          recipient: request.body.email,
          deliveryStatus: 'QUEUED',
        },
      });

      await invoiceDeliveryQueue.add({
        invoiceId: request.params.id,
        channel: 'EMAIL',
        logId: 'log-1',
      });

      return reply
        .code(202)
        .send({ success: true, data: { status: 'QUEUED', recipient: request.body.email } });
    },
  );

  fastify.get(
    '/invoices/:id/download',
    {
      schema: { tags: ['Billing'], summary: 'Download invoice PDF' },
    },
    async (request, reply) => {
      const log = await prisma.invoiceDeliveryLog.findFirst({
        where: { invoiceId: request.params.id, pdfUrl: { not: null } },
        orderBy: { createdAt: 'desc' },
      });

      if (log) {
        return reply.send({ success: true, data: { pdfUrl: log.pdfUrl } });
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id: request.params.id, tenantId: request.tenantId },
      });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      const result = await pdfGenerationService.generateAndStore(
        request.params.id,
        request.tenantId,
      );
      return reply.send({ success: true, data: { pdfUrl: result.pdfUrl } });
    },
  );

  fastify.get(
    '/invoices/:id/delivery-status',
    {
      schema: { tags: ['Billing'], summary: 'Get invoice delivery status' },
    },
    async (request, reply) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: request.params.id, tenantId: request.tenantId },
      });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      const logs = await deliveryAuditService.getDeliveryStatus(request.params.id);
      const stats = await deliveryAuditService.getDeliveryStats(request.params.id);

      return reply.send({ success: true, data: { logs, stats } });
    },
  );

  fastify.post(
    '/invoices/:id/resend',
    {
      schema: { tags: ['Billing'], summary: 'Resend invoice' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    async (request, reply) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: request.params.id, tenantId: request.tenantId },
      });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      const results = [];
      for (const channel of request.body.channels) {
        const log = await prisma.invoiceDeliveryLog.create({
          data: {
            tenantId: request.tenantId,
            invoiceId: request.params.id,
            deliveryChannel: channel.toUpperCase(),
            recipient: channel === 'email' ? request.body.email : request.body.phoneNumber,
            deliveryStatus: 'QUEUED',
          },
        });
        results.push({ channel, logId: log.id, status: 'QUEUED' });
      }

      return reply.code(202).send({ success: true, data: { results } });
    },
  );

  fastify.post(
    '/invoices/bulk-print',
    {
      schema: { tags: ['Billing'], summary: 'Bulk print invoices' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    async (request, reply) => {
      let totalQueued = 0;
      for (const invoiceId of request.body.invoiceIds) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: { items: true, tenant: true },
        });
        if (invoice) {
          await prisma.invoicePrintJob.create({
            data: {
              tenantId: request.tenantId,
              invoiceId,
              printerType: request.body.printerType,
              copies: request.body.copies,
              printStatus: 'PENDING',
            },
          });
          totalQueued++;
        }
      }

      return reply.code(202).send({ success: true, data: { totalQueued } });
    },
  );

  fastify.post(
    '/invoices/:id/regenerate-pdf',
    {
      schema: { tags: ['Billing'], summary: 'Regenerate invoice PDF' },
      preHandler: [requirePermission('VIEW_INVENTORY')],
    },
    async (request, reply) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: request.params.id, tenantId: request.tenantId },
      });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      const result = await pdfGenerationService.generateAndStore(
        request.params.id,
        request.tenantId,
        {
          watermark:
            request.body.reason === 'cancelled' ? 'CANCELLED INVOICE' : request.body.reason,
          triggeredBy: request.user.id,
        },
      );

      return reply.send({ success: true, data: { pdfUrl: result.pdfUrl } });
    },
  );

  fastify.get(
    '/invoices/:id/print-history',
    {
      schema: { tags: ['Billing'], summary: 'Get invoice print history' },
    },
    async (request, reply) => {
      const invoice = await prisma.invoice.findUnique({
        where: { id: request.params.id, tenantId: request.tenantId },
      });
      if (!invoice) return reply.code(404).send({ success: false, message: 'Invoice not found' });

      const printJobs = await prisma.invoicePrintJob.findMany({
        where: { invoiceId: request.params.id },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        success: true,
        data: { printJobs, pagination: { total: printJobs.length } },
      });
    },
  );
}

export default billingActionsFastifyRoutes;
