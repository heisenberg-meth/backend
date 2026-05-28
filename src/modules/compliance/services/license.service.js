import prisma from '../../../config/prisma.js';

class LicenseService {
  async addLicense(tenantId, licenseData) {
    return await prisma.drugLicense.create({
      data: { tenantId, ...licenseData }
    });
  }

  async getActiveLicenses(tenantId) {
    return await prisma.drugLicense.findMany({
      where: { tenantId, status: 'ACTIVE' },
    });
  }

  async checkLicenseExpiry() {
    const licenses = await prisma.drugLicense.findMany({
      where: {
        status: 'ACTIVE',
        expiryDate: { lte: new Date(new Date().setDate(new Date().getDate() + 30)) }
      }
    });
    return licenses;
  }
}

export default new LicenseService();
