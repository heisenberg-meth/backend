import prisma from '../../../config/prisma.js';

class PatientRepository {
  async findAll(tenantId) {
    return prisma.patient.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.patient.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async findByPhone(phone, tenantId) {
    return prisma.patient.findFirst({
      where: { phone, tenantId, deletedAt: null },
    });
  }

  async create(data) {
    return prisma.patient.create({
      data,
    });
  }

  async update(id, tenantId, data) {
    await this.findById(id, tenantId);
    return prisma.patient.update({
      where: { id },
      data,
    });
  }

  async delete(id, tenantId) {
    await this.findById(id, tenantId);
    return prisma.patient.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

export default new PatientRepository();
