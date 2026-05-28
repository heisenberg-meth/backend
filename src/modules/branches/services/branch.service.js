import branchRepository from '../repositories/branch.repository.js';

class BranchService {
  async getBranches(tenantId) {
    return branchRepository.findAll(tenantId);
  }

  async getBranchById(id, tenantId) {
    const branch = await branchRepository.findById(id, tenantId);
    if (!branch) throw new Error('Branch not found');
    return branch;
  }

  async createBranch(tenantId, data) {
    if (data.code) {
      const existing = await branchRepository.findByCode(data.code, tenantId);
      if (existing) throw new Error('Branch with this code already exists');
    }
    return branchRepository.create({ ...data, tenantId });
  }

  async updateBranch(id, tenantId, data) {
    await this.getBranchById(id, tenantId);
    return branchRepository.update(id, tenantId, data);
  }
}

export default new BranchService();
