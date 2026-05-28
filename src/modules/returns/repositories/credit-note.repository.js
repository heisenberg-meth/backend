import prisma from '../../../config/prisma.js';
import sequenceService from '../../../shared/services/sequence.service.js';

class CreditNoteRepository {
  async createCreditNote(data, tx) {
    const client = tx || prisma;
    return client.creditNote.create({
      data,
      include: {
        return: true,
        invoice: true,
      },
    });
  }

  async findById(id, tenantId) {
    return prisma.creditNote.findUnique({
      where: { id, tenantId },
      include: {
        return: {
          include: {
            items: true,
          },
        },
        invoice: true,
      },
    });
  }

  async findByReturnId(returnId, tenantId) {
    return prisma.creditNote.findMany({
      where: { returnId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id, status, tx) {
    const client = tx || prisma;
    return client.creditNote.update({
      where: { id },
      data: { status },
    });
  }

  async generateCreditNoteNumber(tenantId, branchCode, tx) {
    return sequenceService.nextCreditNoteNumber(tenantId, tx, branchCode);
  }
}

export default new CreditNoteRepository();
