import prisma from '../../../config/prisma.js';

class CreditRepository {
  async findByPatientId(patientId, tenantId) {
    return prisma.patientCreditAccount.findUnique({
      where: { patientId, tenantId },
      include: {
        patient: {
          select: {
            fullName: true,
            creditLimit: true,
            creditUsed: true,
          }
        }
      }
    });
  }

  async createAccount(data) {
    return prisma.patientCreditAccount.create({
      data,
    });
  }

  async updateBalance(patientId, tenantId, outstandingBalance, tx) {
    const client = tx || prisma;
    return client.patientCreditAccount.update({
      where: { patientId, tenantId },
      data: {
        outstandingBalance,
      }
    });
  }

  async updateStatus(patientId, tenantId, accountStatus) {
    return prisma.patientCreditAccount.update({
      where: { patientId, tenantId },
      data: { accountStatus }
    });
  }

  async getLedger(patientId, tenantId) {
    return prisma.patientCreditLedger.findMany({
      where: { patientId, tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }

  async createLedgerEntry(data, tx) {
    const client = tx || prisma;
    return client.patientCreditLedger.create({
      data,
    });
  }

  async findLatestLedgerEntry(patientId, tenantId) {
    return prisma.patientCreditLedger.findFirst({
      where: { patientId, tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export default new CreditRepository();
