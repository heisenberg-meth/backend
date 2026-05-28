import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class TenantProvisioningService {
  /**
   * Automate the end-to-end onboarding of a new pharmacy tenant.
   */
  async provisionTenant(tenantData) {
    return await prisma.$transaction(async (tx) => {
      // 1. Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: tenantData.name,
          email: tenantData.email,
          address: tenantData.address,
        },
      });

      // 2. Initialize SaaS Platform Settings
      await tx.tenantSettings.create({
        data: {
          tenantId: tenant.id,
          featureFlags: { ai_forecasting: false, hospital_integration: false },
        },
      });

      logger.info({ tenantId: tenant.id }, '[PLATFORM_PROVISIONING] Tenant initialized');
      return tenant;
    });
  }
}

export default new TenantProvisioningService();
