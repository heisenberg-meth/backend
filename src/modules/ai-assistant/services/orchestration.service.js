import inventoryService from '../../realtime-inventory/services/inventory.service.js';
import authzService from '../../access-control/services/authz.service.js';

/**
 * Orchestrator that bridges LLM intent with safe ERP Tool execution.
 */
class OrchestrationService {
  /**
   * Dispatches a validated request to the appropriate internal tool
   */
  async executeTool(tenantId, userId, toolName, params) {
    // 1. RBAC Validation before Tool Execution
    const permissionMap = {
      getLowStock: 'VIEW_INVENTORY',
      getAnalytics: 'VIEW_ANALYTICS',
    };

    const requiredPermission = permissionMap[toolName];
    if (requiredPermission) {
      const hasAccess = await authzService.hasPermission(userId, requiredPermission);
      if (!hasAccess) throw new Error('Unauthorized access to tool');
    }

    // 2. Dispatch to Domain Service
    switch (toolName) {
      case 'getLowStock':
        return await inventoryService.getLiveStock(tenantId, params.medicineId, params.branchId);
      default:
        throw new Error('Tool not found');
    }
  }
}

export default new OrchestrationService();
