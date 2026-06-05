import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class ProviderRegistry {
  async getActiveProviders(tenantId, channelType) {
    const configs = await prisma.notificationChannelConfig.findMany({
      where: { tenantId, channelType, isActive: true },
      orderBy: { priority: 'desc' },
    });

    if (configs.length === 0) {
      return this._getDefaultProviders(channelType);
    }

    return configs.map((c) => ({
      providerName: c.providerName,
      config: c.providerConfig || {},
      priority: c.priority,
      dailyLimit: c.dailyLimit,
      rateLimitPerMinute: c.rateLimitPerMinute,
    }));
  }

  async recordDelivery(tenantId, channelType, providerName, success) {
    try {
      const config = await prisma.notificationChannelConfig.findFirst({
        where: { tenantId, channelType, providerName },
      });
      if (!config) return;
      await prisma.notificationChannelConfig.update({
        where: { id: config.id },
        data: {
          totalSent: success ? { increment: 1 } : undefined,
          totalFailed: success ? undefined : { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error(
        { error, tenantId, channelType, providerName },
        '[ProviderRegistry] Failed to record delivery',
      );
    }
  }

  async sendWithFailover(tenantId, channelType, sendFn) {
    const providers = await this.getActiveProviders(tenantId, channelType);
    const errors = [];

    for (const provider of providers) {
      try {
        logger.info(`[ProviderRegistry] Trying ${provider.providerName} for ${channelType}`);
        const result = await sendFn(provider);
        await this.recordDelivery(tenantId, channelType, provider.providerName, true);
        return { success: true, providerName: provider.providerName, result };
      } catch (error) {
        logger.warn(`[ProviderRegistry] ${provider.providerName} failed: ${error.message}`);
        errors.push({ providerName: provider.providerName, error: error.message });
        await this.recordDelivery(tenantId, channelType, provider.providerName, false);
      }
    }

    return { success: false, errors };
  }

  _getDefaultProviders(channelType) {
    const defaults = {
      EMAIL: [{ providerName: 'resend', config: {}, priority: 0 }],
      SMS: [{ providerName: 'twilio', config: {}, priority: 0 }],
      WHATSAPP: [{ providerName: 'twilio', config: {}, priority: 0 }],
      PUSH: [{ providerName: 'firebase', config: {}, priority: 0 }],
    };
    return defaults[channelType] || [];
  }
}

export default new ProviderRegistry();
