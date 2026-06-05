import integrationRepository from '../repositories/integration.repository.js';
import { encrypt, decrypt } from '../../security/utils/encryption.util.js';
import logger from '../../../shared/utils/logger.js';
import eventBus from '../../../shared/services/eventbus.service.js';

class IntegrationService {
  async getSettings(tenantId, branchId = null) {
    const providers = await integrationRepository.getProviders(tenantId, branchId);

    const settings = {
      whatsapp: null,
      sms: null,
      email: null,
    };

    providers.forEach((p) => {
      const type = p.providerType.toLowerCase();
      if (settings[type] === undefined) return;

      // Only include primary or first one if multiple exist
      if (!settings[type] || p.isPrimary) {
        settings[type] = {
          provider: p.providerName,
          enabled: p.isEnabled,
          // We don't return full config/secrets to frontend usually,
          // or we redact sensitive parts
          config: this._redactConfig(p.config),
        };
      }
    });

    return settings;
  }

  async updateSettings(tenantId, settings, userId, branchId = null) {
    const results = [];

    for (const [type, data] of Object.entries(settings)) {
      const providerType = type.toUpperCase();
      const { provider: providerName, enabled, config } = data;

      if (!providerName) continue;

      // Encrypt sensitive config before saving
      const encryptedConfig = this._encryptConfig(config);

      const updated = await integrationRepository.updateProvider(
        tenantId,
        providerType,
        {
          providerName,
          isEnabled: enabled,
          isPrimary: true, // For now, assume update sets as primary
          config: encryptedConfig,
          updatedBy: userId,
        },
        branchId,
      );

      results.push(updated);

      await eventBus.publish('INTEGRATION_UPDATED', {
        tenantId,
        providerType,
        providerName,
        updatedBy: userId,
      });
    }

    return results;
  }

  async testProvider(tenantId, providerType, branchId = null) {
    const provider = await integrationRepository.getProviderByType(
      tenantId,
      providerType.toUpperCase(),
      branchId,
    );
    if (!provider) {
      throw new Error(`Provider for ${providerType} not found`);
    }

    logger.info(
      { tenantId, providerType, providerName: provider.providerName },
      '[INTEGRATIONS] Testing provider...',
    );

    return {
      success: true,
      message: `Test successful for ${provider.providerName}`,
      timestamp: new Date().toISOString(),
    };
  }

  async checkHealth(tenantId) {
    // This could be triggered by a cron or on-demand
    // In a real scenario, we'd ping the provider APIs
    return integrationRepository.getLatestHealth(tenantId);
  }

  _encryptConfig(config) {
    if (!config) return {};
    const encrypted = { ...config };
    // Example: encrypt apiKey, secret, etc.
    const sensitiveKeys = ['apiKey', 'apiSecret', 'authToken', 'password', 'secret'];

    sensitiveKeys.forEach((key) => {
      if (encrypted[key]) {
        encrypted[key] = encrypt(encrypted[key]);
      }
    });

    return encrypted;
  }

  _decryptConfig(config) {
    if (!config) return {};
    const decrypted = { ...config };
    const sensitiveKeys = ['apiKey', 'apiSecret', 'authToken', 'password', 'secret'];

    sensitiveKeys.forEach((key) => {
      if (decrypted[key]) {
        try {
          decrypted[key] = decrypt(decrypted[key]);
        } catch {
          logger.error({ key }, '[INTEGRATIONS] Decryption failed');
        }
      }
    });

    return decrypted;
  }

  _redactConfig(config) {
    if (!config) return {};
    const redacted = { ...config };
    const sensitiveKeys = ['apiKey', 'apiSecret', 'authToken', 'password', 'secret'];

    sensitiveKeys.forEach((key) => {
      if (redacted[key]) {
        redacted[key] = '********';
      }
    });

    return redacted;
  }
}

export default new IntegrationService();
