import prisma from '../../../config/prisma.js';

class StoreProfileRepository {
  async findByTenantId(tenantId, branchId = null) {
    return prisma.storeProfile.findUnique({
      where: {
        tenantId_branchId: { tenantId, branchId },
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        documents: {
          where: { isVerified: true },
          orderBy: { createdAt: 'desc' },
        },
        localizations: true,
      },
    });
  }

  async findAllByTenant(tenantId) {
    return prisma.storeProfile.findMany({
      where: { tenantId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ branchId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
  }

  async create(tenantId, data) {
    return prisma.storeProfile.create({
      data: {
        tenantId,
        ...data,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async update(profileId, data) {
    return prisma.storeProfile.update({
      where: { id: profileId },
      data,
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async upsert(tenantId, branchId, data) {
    return prisma.storeProfile.upsert({
      where: {
        tenantId_branchId: { tenantId, branchId },
      },
      update: data,
      create: {
        tenantId,
        branchId,
        ...data,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async createVersion(tenantId, profileId, versionNumber, snapshot, changedBy, changeReason) {
    return prisma.storeProfileVersion.create({
      data: {
        tenantId,
        profileId,
        versionNumber,
        snapshot,
        changedBy,
        changeReason,
      },
    });
  }

  async getVersionCount(profileId) {
    return prisma.storeProfileVersion.count({
      where: { profileId },
    });
  }

  async getVersions(profileId, limit = 50, offset = 0) {
    const [versions, total] = await Promise.all([
      prisma.storeProfileVersion.findMany({
        where: { profileId },
        orderBy: { versionNumber: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.storeProfileVersion.count({ where: { profileId } }),
    ]);

    return { versions, total, limit, offset };
  }

  async getVersionById(versionId, tenantId) {
    return prisma.storeProfileVersion.findFirst({
      where: { id: versionId, tenantId },
    });
  }

  async createDocument(tenantId, profileId, data) {
    return prisma.storeProfileDocument.create({
      data: {
        tenantId,
        profileId,
        ...data,
      },
    });
  }

  async getDocuments(profileId, tenantId, documentType = null) {
    const where = { profileId, tenantId };
    if (documentType) where.documentType = documentType;

    return prisma.storeProfileDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async verifyDocument(documentId, verifiedBy) {
    return prisma.storeProfileDocument.update({
      where: { id: documentId },
      data: {
        isVerified: true,
        verifiedBy,
        verifiedAt: new Date(),
      },
    });
  }

  async upsertLocalization(tenantId, profileId, language, data) {
    return prisma.storeProfileLocalization.upsert({
      where: {
        tenantId_profileId_language: { tenantId, profileId, language },
      },
      update: data,
      create: {
        tenantId,
        profileId,
        language,
        ...data,
      },
    });
  }

  async getLocalizations(profileId, tenantId) {
    return prisma.storeProfileLocalization.findMany({
      where: { profileId, tenantId },
    });
  }

  async getExpiringLicenses(tenantId, daysThreshold = 30) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    return prisma.storeProfile.findMany({
      where: {
        tenantId,
        OR: [
          {
            drugLicenseExpiry: {
              lte: thresholdDate,
              gte: new Date(),
            },
          },
          {
            fssaiLicenseExpiry: {
              lte: thresholdDate,
              gte: new Date(),
            },
          },
        ],
      },
      select: {
        id: true,
        storeName: true,
        branchId: true,
        drugLicenseNumber: true,
        drugLicenseExpiry: true,
        fssaiLicense: true,
        fssaiLicenseExpiry: true,
      },
    });
  }

  async findByGstin(tenantId, gstin) {
    return prisma.storeProfile.findFirst({
      where: { tenantId, gstin },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });
  }
}

export default new StoreProfileRepository();
