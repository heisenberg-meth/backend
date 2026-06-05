import prisma from '../../../config/prisma.js';
import sequenceService from '../../../shared/services/sequence.service.js';

class TransferRepository {
  async createTransfer(data, tx) {
    const client = tx || prisma;
    return client.stockTransfer.create({
      data: {
        tenantId: data.tenantId,
        sourceBranchId: data.sourceBranchId,
        destinationBranchId: data.destinationBranchId,
        transferNumber: data.transferNumber,
        status: data.status,
        initiatedBy: data.initiatedBy,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            batchId: item.batchId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: {
          include: {
            batch: {
              include: { medicine: true },
            },
          },
        },
        sourceBranch: true,
        destinationBranch: true,
      },
    });
  }

  async findById(id, tenantId, tx) {
    const client = tx || prisma;
    return client.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            batch: {
              include: { medicine: true },
            },
          },
        },
        sourceBranch: true,
        destinationBranch: true,
      },
    });
  }

  async findAll(tenantId, filters = {}, skip = 0, take = 20) {
    const { sourceBranchId, destinationBranchId, status } = filters;
    return prisma.stockTransfer.findMany({
      where: {
        tenantId,
        ...(sourceBranchId && { sourceBranchId }),
        ...(destinationBranchId && { destinationBranchId }),
        ...(status && { status }),
      },
      include: {
        sourceBranch: true,
        destinationBranch: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async updateStatus(id, tenantId, status, approverId, tx) {
    const client = tx || prisma;
    const data = { status };
    if (approverId && status === 'APPROVED') {
      data.approvedBy = approverId;
    }
    return client.stockTransfer.update({
      where: { id, tenantId },
      data,
    });
  }

  async getNextTransferNumber(tenantId, tx) {
    return sequenceService.nextTransferNumber(tenantId, tx);
  }
}

export default new TransferRepository();
