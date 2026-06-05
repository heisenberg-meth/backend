import returnsController from '../fastify/returns.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function returnsFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.post(
    '/returns',
    {
      schema: { tags: ['Returns'], summary: 'Create a return request' },
      preHandler: [requirePermission('returns.create')],
    },
    returnsController.createReturn,
  );

  fastify.get(
    '/returns',
    {
      schema: { tags: ['Returns'], summary: 'List returns with filters' },
      preHandler: [requirePermission('returns.read')],
    },
    returnsController.getReturns,
  );

  fastify.get(
    '/returns/stats',
    {
      schema: { tags: ['Returns'], summary: 'Return statistics' },
      preHandler: [requirePermission('returns.read')],
    },
    returnsController.getReturnStats,
  );

  fastify.get(
    '/returns/fraud-stats',
    {
      schema: { tags: ['Returns'], summary: 'Fraud detection stats for returns' },
      preHandler: [requirePermission('returns.admin')],
    },
    returnsController.getFraudStats,
  );

  fastify.get(
    '/returns/gst-impact',
    {
      schema: { tags: ['Returns'], summary: 'GST impact from returns' },
      preHandler: [requirePermission('returns.admin')],
    },
    returnsController.getGstImpact,
  );

  fastify.get(
    '/returns/:id',
    {
      schema: { tags: ['Returns'], summary: 'Get return by ID' },
      preHandler: [requirePermission('returns.read')],
    },
    returnsController.getReturnById,
  );

  fastify.post(
    '/returns/:id/approve',
    {
      schema: { tags: ['Returns'], summary: 'Approve a return' },
      preHandler: [requirePermission('returns.approve')],
    },
    returnsController.approveReturn,
  );

  fastify.post(
    '/returns/:id/reject',
    {
      schema: { tags: ['Returns'], summary: 'Reject a return' },
      preHandler: [requirePermission('returns.approve')],
    },
    returnsController.rejectReturn,
  );

  fastify.post(
    '/returns/:id/credit-note',
    {
      schema: { tags: ['Returns'], summary: 'Generate credit note for return' },
      preHandler: [requirePermission('returns.create')],
    },
    returnsController.generateCreditNote,
  );

  fastify.post(
    '/returns/:id/refund',
    {
      schema: { tags: ['Returns'], summary: 'Process refund for return' },
      preHandler: [requirePermission('returns.refund')],
    },
    returnsController.processRefund,
  );

  fastify.post(
    '/returns/:id/refund/retry',
    {
      schema: { tags: ['Returns'], summary: 'Retry failed refund' },
      preHandler: [requirePermission('returns.refund')],
    },
    returnsController.retryRefund,
  );

  fastify.post(
    '/returns/:id/disposition',
    {
      schema: { tags: ['Returns'], summary: 'Process inventory disposition' },
      preHandler: [requirePermission('returns.create')],
    },
    returnsController.processDisposition,
  );
}

export default returnsFastifyRoutes;
