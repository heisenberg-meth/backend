import prisma from '../../../config/prisma.js';

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

  async generateCreditNoteNumber(tenantId, branchCode) {
    const year = new Date().getFullYear();
    const prefix = `CN-${branchCode || 'GEN'}-${year}`;

    const lastCreditNote = await prisma.creditNote.findFirst({
      where: {
        tenantId,
        creditNoteNumber: { startsWith: prefix },
      },
      orderBy: { creditNoteNumber: 'desc' },
      select: { creditNoteNumber: true },
    });

    const sequence = lastCreditNote
      ? parseInt(lastCreditNote.creditNoteNumber.split('-').pop(), 10) + 1
      : 1;

    return `${prefix}-${String(sequence).padStart(6, '0')}`;
  }
}

export default new CreditNoteRepository();
