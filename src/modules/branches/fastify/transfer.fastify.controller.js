import transferService from '../services/transfer.service.js';

class TransferFastifyController {
  async requestTransfer(request, reply) {
    const transfer = await transferService.requestTransfer(
      request.tenantId,
      request.body,
      request.user.id,
    );
    return reply.code(201).send(transfer);
  }

  async approveTransfer(request, reply) {
    const transfer = await transferService.approveTransfer(
      request.params.id,
      request.tenantId,
      request.user.id,
    );
    return reply.send(transfer);
  }

  async receiveTransfer(request, reply) {
    const transfer = await transferService.receiveTransfer(
      request.params.id,
      request.tenantId,
      request.user.id,
    );
    return reply.send(transfer);
  }

  async getTransfers(request, reply) {
    const { sourceBranchId, destinationBranchId, status, page, limit } = request.query;
    const transfers = await transferService.getTransfers(
      request.tenantId,
      { sourceBranchId, destinationBranchId, status },
      parseInt(page) || 1,
      parseInt(limit) || 20,
    );
    return reply.send(transfers);
  }
}

export default new TransferFastifyController();
