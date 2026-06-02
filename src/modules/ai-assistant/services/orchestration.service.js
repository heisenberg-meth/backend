import inventoryService from '../../realtime-inventory/services/inventory.service.js';
import authzService from '../../access-control/services/authz.service.js';

class OrchestrationService {
  async executeTool(tenantId, userId, toolName, params) {
    const permissionMap = {
      getLowStock: 'VIEW_INVENTORY',
      getAnalytics: 'VIEW_ANALYTICS',
    };

    const requiredPermission = permissionMap[toolName];
    if (requiredPermission) {
      const hasAccess = await authzService.hasPermission(userId, requiredPermission);
      if (!hasAccess) throw new Error('Unauthorized access to tool');
    }

    switch (toolName) {
      case 'getLowStock':
        return await inventoryService.getLiveStock(tenantId, params.medicineId, params.branchId);
      default:
        throw new Error('Tool not found');
    }
  }
}

export default new OrchestrationService();
