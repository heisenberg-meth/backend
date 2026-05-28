import prisma from '../../../config/prisma.js';

class CategoryRepository {
  async findAll(tenantId) {
    const categories = await prisma.medicineCategory.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        _count: { select: { medicines: { where: { deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });

    return categories.map((c) => ({
      ...c,
      medicineCount: c._count.medicines,
    }));
  }

  async findById(id, tenantId) {
    const category = await prisma.medicineCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        _count: { select: { medicines: { where: { deletedAt: null } } } },
        medicines: {
          where: { deletedAt: null },
          take: 10,
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!category) return null;

    return {
      ...category,
      medicineCount: category._count.medicines,
    };
  }

  async create(data) {
    return prisma.medicineCategory.create({ data });
  }

  async update(id, tenantId, data) {
    return prisma.medicineCategory.update({
      where: { id, tenantId },
      data,
    });
  }

  async softDelete(id, tenantId) {
    await prisma.medicine.updateMany({
      where: { categoryId: id, tenantId },
      data: { categoryId: null },
    });

    return prisma.medicineCategory.update({
      where: { id, tenantId },
      data: { deletedAt: new Date() },
    });
  }

  async getAnalytics(tenantId) {
    const categories = await prisma.medicineCategory.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        medicines: {
          where: { deletedAt: null },
          include: {
            inventoryBatches: {
              where: { deletedAt: null, status: 'ACTIVE' },
              select: { quantity: true, sellingPrice: true },
            },
          },
        },
      },
    });

    return categories.map(c => {
      const totalStock = c.medicines.reduce(
        (sum, m) => sum + m.inventoryBatches.reduce((bs, b) => bs + b.quantity, 0), 0
      );
      const totalValue = c.medicines.reduce(
        (sum, m) => sum + m.inventoryBatches.reduce((bv, b) => bv + b.quantity * b.sellingPrice, 0), 0
      );

      return {
        id: c.id,
        name: c.name,
        medicineCount: c.medicines.length,
        totalStock,
        totalValue,
      };
    });
  }
}

export default new CategoryRepository();
