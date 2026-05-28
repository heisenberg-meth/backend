import centralizedInventoryService from '../services/centralized-inventory.service.js';

class CentralInventoryFastifyController {
  async getGlobalInventory(request, reply) {
    const inventory = await centralizedInventoryService.getGlobalInventory(request.tenantId);
    return reply.send(inventory);
  }

  async getBranchInventory(request, reply) {
    const inventory = await centralizedInventoryService.getBranchInventory(request.tenantId, request.params.branchId);
    return reply.send(inventory);
  }
}

export default new CentralInventoryFastifyController();
