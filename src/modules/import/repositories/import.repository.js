import prisma from '../../../config/prisma.js';

class ImportRepository {
  async createJob(data) {
    return prisma.importJob.create({
      data,
    });
  }

  async updateJob(id, tenantId, data) {
    return prisma.importJob.update({
      where: { id, tenantId },
      data,
    });
  }

  async getJobById(id, tenantId) {
    return prisma.importJob.findFirst({
      where: { id, tenantId },
      include: {
        extractedItems: {
          include: {
            medicine: {
              select: { id: true, name: true, sku: true, unitPrice: true },
            },
          },
        },
      },
    });
  }

  async getJobs(tenantId, filters = {}) {
    const { status, type, from, to, skip = 0, take = 20 } = filters;
    return prisma.importJob.findMany({
      where: {
        tenantId,
        ...(status && { importStatus: status }),
        ...(type && { importType: type }),
        ...(from &&
          to && {
            createdAt: {
              gte: new Date(from),
              lte: new Date(to),
            },
          }),
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async createExtractedItem(data) {
    return prisma.importExtractedItem.create({
      data,
    });
  }

  async updateExtractedItem(id, data) {
    return prisma.importExtractedItem.update({
      where: { id },
      data,
    });
  }

  async findMedicineFuzzy(tenantId, name) {
    if (!name) return null;

    const exact = await prisma.medicine.findFirst({
      where: {
        tenantId,
        name: { equals: name.trim(), mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (exact) return exact;

    const generic = await prisma.medicine.findFirst({
      where: {
        tenantId,
        genericName: { equals: name.trim(), mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (generic) return generic;

    const searchPart = name.trim().substring(0, 6);
    if (searchPart.length >= 3) {
      return prisma.medicine.findFirst({
        where: {
          tenantId,
          OR: [
            { name: { contains: searchPart, mode: 'insensitive' } },
            { genericName: { contains: searchPart, mode: 'insensitive' } },
          ],
          deletedAt: null,
        },
      });
    }

    return null;
  }
}

export default new ImportRepository();
