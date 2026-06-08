import prisma from '../../../config/prisma.js';
import bcrypt from 'bcryptjs';
import logger from '../../../shared/utils/logger.js';
import eventBus from '../../../shared/services/eventbus.service.js';

class TenantProvisioningService {
  /**
   * Orchestrate full organization provisioning
   */
  async provision(data) {
    const { name, email, password, address, gstNumber, plan = 'STARTER' } = data;

    return await prisma.$transaction(async (tx) => {
      // 1. Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name,
          email,
          address,
          gstNumber,
          maxBranches: plan === 'ENTERPRISE' ? 10 : 1,
          maxUsers: plan === 'ENTERPRISE' ? 50 : 5,
          aiEnabled: plan !== 'STARTER',
        },
      });

      // 2. Create Default Branch
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Main Branch',
          code: `${name.substring(0, 3).toUpperCase()}-001`,
        },
      });

      // 3. Create Admin User (Owner)
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email,
          password: hashedPassword,
          fullName: 'Organization Admin',
          role: 'OWNER',
        },
      });

      // 4. Seed Default Roles
      await this._seedDefaultRoles(tenant.id, tx);

      // 5. Initialize Settings
      await tx.tenantSettings.create({
        data: {
          tenantId: tenant.id,
          featureFlags: {
            ai_analytics: plan !== 'STARTER',
            whatsapp_notifications: plan === 'ENTERPRISE',
          },
        },
      });

      // 6. Initialize Branding
      await tx.tenantBranding.create({
        data: {
          tenantId: tenant.id,
          primaryColor: '#00BFA5', // Teal
          secondaryColor: '#FFFFFF',
        },
      });

      // 7. Create Subscription
      const planMapping = {
        STARTER: 'free-trial',
        ENTERPRISE: 'pro-monthly',
      };
      const resolvedPlanId = planMapping[plan] || plan.toLowerCase();

      await tx.subscriptionPlan.upsert({
        where: { id: resolvedPlanId },
        update: {},
        create: {
          id: resolvedPlanId,
          name: resolvedPlanId
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          price: plan === 'ENTERPRISE' ? 2999 : 0,
          billingCycle: 'MONTHLY',
          features: ['Access to platform features'],
        },
      });

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          planId: resolvedPlanId,
          status: 'TRIAL',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 day trial
        },
      });

      logger.info({ tenantId: tenant.id, email }, 'Organization provisioned successfully');

      eventBus.emit('TENANT_PROVISIONED', { tenantId: tenant.id, adminId: user.id });

      return { tenant, user, branch };
    });
  }

  async _seedDefaultRoles(tenantId, tx) {
    const defaultRoles = [
      { name: 'PHARMACIST', description: 'Can dispense and manage inventory' },
      { name: 'CASHIER', description: 'Billing and payments only' },
      { name: 'BRANCH_MANAGER', description: 'Full branch operations' },
    ];

    for (const role of defaultRoles) {
      await tx.accessRole.create({
        data: {
          tenantId,
          name: role.name,
          description: role.description,
        },
      });
    }
  }

  async getTenantMetrics(tenantId) {
    const [userCount, branchCount, invoiceCount] = await Promise.all([
      prisma.user.count({ where: { tenantId } }),
      prisma.branch.count({ where: { tenantId } }),
      prisma.invoice.count({ where: { tenantId } }),
    ]);

    return { userCount, branchCount, invoiceCount };
  }

  async suspendTenant(tenantId) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED' },
    });
  }
}

export default new TenantProvisioningService();
