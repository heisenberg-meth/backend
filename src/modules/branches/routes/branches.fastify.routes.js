import branchController from '../fastify/branch.fastify.controller.js';
import transferController from '../fastify/transfer.fastify.controller.js';
import centralInventoryController from '../fastify/central-inventory.fastify.controller.js';
import { authenticate, requireTenant } from '../../../middleware/auth.fastify.js';
import { requirePermission } from '../../../middleware/permission.fastify.js';

async function branchesFastifyRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);
  fastify.get('/', { schema: { tags: ['Branches'], summary: 'List branches' }, preHandler: [requirePermission('settings.read')] }, branchController.getBranches);
  fastify.post('/', { schema: { tags: ['Branches'], summary: 'Create branch' }, preHandler: [requirePermission('settings.manage')] }, branchController.createBranch);
  fastify.get('/:id', { schema: { tags: ['Branches'], summary: 'Get branch by ID' }, preHandler: [requirePermission('settings.read')] }, branchController.getBranchById);
  fastify.put('/:id', { schema: { tags: ['Branches'], summary: 'Update branch' }, preHandler: [requirePermission('settings.manage')] }, branchController.updateBranch);
  fastify.get('/inventory/global', { schema: { tags: ['Branches'], summary: 'Global inventory view' }, preHandler: [requirePermission('inventory.read')] }, centralInventoryController.getGlobalInventory);
  fastify.get('/inventory/branch/:branchId', { schema: { tags: ['Branches'], summary: 'Branch inventory view' }, preHandler: [requirePermission('inventory.read')] }, centralInventoryController.getBranchInventory);
  fastify.get('/transfers', { schema: { tags: ['Branches'], summary: 'List transfers' }, preHandler: [requirePermission('inventory.read')] }, transferController.getTransfers);
  fastify.post('/transfers', { schema: { tags: ['Branches'], summary: 'Request transfer' }, preHandler: [requirePermission('inventory.update')] }, transferController.requestTransfer);
  fastify.put('/transfers/:id/approve', { schema: { tags: ['Branches'], summary: 'Approve transfer' }, preHandler: [requirePermission('settings.manage')] }, transferController.approveTransfer);
  fastify.put('/transfers/:id/receive', { schema: { tags: ['Branches'], summary: 'Receive transfer' }, preHandler: [requirePermission('inventory.update')] }, transferController.receiveTransfer);
}

export default branchesFastifyRoutes;
