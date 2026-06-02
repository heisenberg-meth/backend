import roleRepository from '../repositories/role.repository.js';
import permissionRepository from '../repositories/permission.repository.js';

class RoleService {
  async getRoles(tenantId) {
    return roleRepository.findAll(tenantId);
  }

  async getRoleById(id, tenantId) {
    const role = await roleRepository.findById(id, tenantId);
    if (!role) throw new Error('Role not found');
    return role;
  }

  async createRole(tenantId, data) {
    const existing = await roleRepository.findByName(data.name, tenantId);
    if (existing) throw new Error('Role with this name already exists for this tenant');

    return roleRepository.create({ ...data, tenantId });
  }

  async updateRole(id, tenantId, data) {
    await this.getRoleById(id, tenantId);
    return roleRepository.update(id, tenantId, data);
  }

  async getPermissions() {
    return permissionRepository.findAll();
  }

  async seedPermissions() {
    const standardPermissions = [
      { name: 'VIEW_INVENTORY', module: 'INVENTORY' },
      { name: 'CREATE_INVENTORY', module: 'INVENTORY' },
      { name: 'UPDATE_INVENTORY', module: 'INVENTORY' },
      { name: 'DELETE_INVENTORY', module: 'INVENTORY' },
      { name: 'VIEW_BILL', module: 'BILLING' },
      { name: 'CREATE_BILL', module: 'BILLING' },
      { name: 'VOID_BILL', module: 'BILLING' },
      { name: 'REFUND_BILL', module: 'BILLING' },
      { name: 'PRINT_INVOICE', module: 'BILLING' },
      { name: 'CREATE_PO', module: 'PURCHASE' },
      { name: 'APPROVE_PO', module: 'PURCHASE' },
      { name: 'RECEIVE_STOCK', module: 'PURCHASE' },
      { name: 'RETURN_TO_SUPPLIER', module: 'PURCHASE' },
      { name: 'VIEW_SALES', module: 'SALES' },
      { name: 'PROCESS_RETURN', module: 'SALES' },
      { name: 'VIEW_REPORTS', module: 'ANALYTICS' },
      { name: 'VIEW_FINANCIALS', module: 'ANALYTICS' },
      { name: 'MANAGE_USERS', module: 'USERS' },
      { name: 'MANAGE_ROLES', module: 'ACCESS_CONTROL' },
      { name: 'MANAGE_SETTINGS', module: 'SYSTEM' },
      { name: 'VIEW_AUDIT_LOGS', module: 'SYSTEM' },
      { name: 'MEDICINE_REORDER_UPDATE', module: 'MEDICINE_CONFIG' },
      { name: 'MEDICINE_PRICING_UPDATE', module: 'MEDICINE_CONFIG' },
      { name: 'MEDICINE_STATUS_UPDATE', module: 'MEDICINE_CONFIG' },
      { name: 'MEDICINE_BULK_PRICING', module: 'MEDICINE_CONFIG' },
      { name: 'MEDICINE_OVERRIDE_LOSS', module: 'MEDICINE_CONFIG' },
      { name: 'MEDICINE_APPROVE_PRICING', module: 'MEDICINE_CONFIG' },
    ];

    const results = [];
    for (const p of standardPermissions) {
      results.push(await permissionRepository.upsert(p));
    }
    return results;
  }
}

export default new RoleService();
