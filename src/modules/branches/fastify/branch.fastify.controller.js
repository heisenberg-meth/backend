import branchService from '../services/branch.service.js';

class BranchFastifyController {
  async getBranches(request, reply) {
    const branches = await branchService.getBranches(request.tenantId);
    return reply.send(branches);
  }

  async getBranchById(request, reply) {
    const branch = await branchService.getBranchById(request.params.id, request.tenantId);
    return reply.send(branch);
  }

  async createBranch(request, reply) {
    const branch = await branchService.createBranch(request.tenantId, request.body);
    return reply.code(201).send(branch);
  }

  async updateBranch(request, reply) {
    const branch = await branchService.updateBranch(request.params.id, request.tenantId, request.body);
    return reply.send(branch);
  }
}

export default new BranchFastifyController();
