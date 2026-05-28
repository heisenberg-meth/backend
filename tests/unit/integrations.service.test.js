import { jest , describe, beforeEach, it, expect } from '@jest/globals';

const mockIntegrationRepository = {
  getProviders: jest.fn(),
  getProviderByType: jest.fn(),
  updateProvider: jest.fn(),
  logHealth: jest.fn(),
  getLatestHealth: jest.fn(),
};

const mockEncryptionUtil = {
  encrypt: jest.fn((text) => `encrypted:${text}`),
  decrypt: jest.fn((text) => text.replace('encrypted:', '')),
};

const mockEventBus = {
  publish: jest.fn().mockResolvedValue(true),
};

jest.unstable_mockModule('../../src/modules/integrations/repositories/integration.repository.js', () => ({
  default: mockIntegrationRepository,
}));

jest.unstable_mockModule('../../src/modules/security/utils/encryption.util.js', () => ({
  encrypt: mockEncryptionUtil.encrypt,
  decrypt: mockEncryptionUtil.decrypt,
}));

jest.unstable_mockModule('../../src/shared/services/eventbus.service.js', () => ({
  default: mockEventBus,
}));

const { default: integrationService } = await import('../../src/modules/integrations/services/integration.service.js');

describe('IntegrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return empty settings if no providers found', async () => {
      mockIntegrationRepository.getProviders.mockResolvedValue([]);
      const result = await integrationService.getSettings('tenant-1');
      expect(result).toEqual({
        whatsapp: null,
        sms: null,
        email: null,
      });
    });

    it('should return redacted settings if providers found', async () => {
      mockIntegrationRepository.getProviders.mockResolvedValue([
        {
          providerType: 'SMS',
          providerName: 'MSG91',
          isEnabled: true,
          isPrimary: true,
          config: { apiKey: 'encrypted:secret-key', senderId: 'VIYANM' },
        },
      ]);

      const result = await integrationService.getSettings('tenant-1');
      expect(result.sms.provider).toBe('MSG91');
      expect(result.sms.config.apiKey).toBe('********');
      expect(result.sms.config.senderId).toBe('VIYANM');
    });
  });

  describe('updateSettings', () => {
    it('should encrypt sensitive keys and call repository', async () => {
      const settings = {
        sms: {
          provider: 'MSG91',
          enabled: true,
          config: { apiKey: 'raw-secret', senderId: 'VIYANM' },
        },
      };

      await integrationService.updateSettings('tenant-1', settings, 'user-1');

      expect(mockEncryptionUtil.encrypt).toHaveBeenCalledWith('raw-secret');
      expect(mockIntegrationRepository.updateProvider).toHaveBeenCalledWith(
        'tenant-1',
        'SMS',
        expect.objectContaining({
          providerName: 'MSG91',
          isEnabled: true,
          config: { apiKey: 'encrypted:raw-secret', senderId: 'VIYANM' },
        }),
        null
      );
    });
  });
});
