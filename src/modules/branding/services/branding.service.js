import prisma from '../../../config/prisma.js';

class BrandingService {

  async getTenantBranding(tenantId) {
    return await prisma.tenantBranding.findUnique({
      where: { tenantId },
    });
  }

  async updateBranding(tenantId, brandingData) {
    return await prisma.tenantBranding.upsert({
      where: { tenantId },
      update: brandingData,
      create: { tenantId, ...brandingData }
    });
  }
}

export default new BrandingService();
