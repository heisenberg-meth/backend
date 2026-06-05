import prisma from '../../../config/prisma.js';

class SupplierRepository {
  async findAll(tenantId) {
    return prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async create(data) {
    return prisma.supplier.create({
      data: {
        ...data,
        metrics: { create: {} }, // Initialize metrics
      },
    });
  }

  async getNextSupplierCode(tenantId) {
    const lastSupplier = await prisma.supplier.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { supplierCode: true },
    });

    if (!lastSupplier || !lastSupplier.supplierCode) {
      return 'SUP-001';
    }

    const lastNum = parseInt(lastSupplier.supplierCode.split('-').pop());
    const nextNum = (lastNum + 1).toString().padStart(3, '0');
    return `SUP-${nextNum}`;
  }

  async update(id, tenantId, data) {
    return prisma.supplier.update({
      where: { id, tenantId },
      data,
    });
  }

  async delete(id, tenantId) {
    return prisma.supplier.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }

  async findByGst(gstNumber, tenantId) {
    return prisma.supplier.findFirst({
      where: { gstNumber, tenantId, deletedAt: null },
    });
  }
}

export default new SupplierRepository();
