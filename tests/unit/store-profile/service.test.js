import { jest, describe, afterEach, it, expect } from '@jest/globals';

const mockPrisma = {
  storeProfile: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  storeProfileVersion: {
    count: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  storeProfileDocument: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  storeProfileLocalization: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
};

const mockLogger = {
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

const mockAuditRepository = {
  logChange: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({ default: mockPrisma }));
jest.unstable_mockModule('../../../src/config/redis.js', () => ({
  default: mockRedisClient,
  quitRedis: jest.fn().mockResolvedValue(),
}));
jest.unstable_mockModule('../../../src/shared/utils/logger.js', () => ({ default: mockLogger }));
jest.unstable_mockModule('../../../src/modules/settings/gst/settings.audit.repository.js', () => ({ default: mockAuditRepository }));
jest.unstable_mockModule('../../../src/modules/store-profile/events/store-profile.events.js', () => ({
  storeProfileEventEmitter: mockEventEmitter,
  StoreProfileEvents: {
    STORE_PROFILE_CREATED: 'store_profile:created',
    STORE_PROFILE_UPDATED: 'store_profile:updated',
    STORE_PROFILE_VERSIONED: 'store_profile:versioned',
    GSTIN_CHANGED: 'store_profile:gstin_changed',
    DRUG_LICENSE_UPDATED: 'store_profile:drug_license_updated',
    BRANDING_UPDATED: 'store_profile:branding_updated',
    DOCUMENT_UPLOADED: 'store_profile:document_uploaded',
    DOCUMENT_VERIFIED: 'store_profile:document_verified',
    LOCALIZATION_UPDATED: 'store_profile:localization_updated',
    CACHE_INVALIDATED: 'store_profile:cache_invalidated',
    COMPLIANCE_ALERT: 'store_profile:compliance_alert',
  },
}));

const { default: storeProfileService } = await import('../../../src/modules/store-profile/services/store-profile.service.js');

describe('StoreProfileService', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('should return cached profile if available', async () => {
      const cachedProfile = { id: 'profile-1', storeName: 'Cached Pharmacy' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedProfile));

      const result = await storeProfileService.getProfile(tenantId);

      expect(result).toEqual(cachedProfile);
      expect(mockPrisma.storeProfile.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database if cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const dbProfile = {
        id: 'profile-1',
        tenantId,
        branchId: null,
        storeName: 'Test Pharmacy',
        gstin: null,
        drugLicenseNumber: null,
        phoneNumber: null,
        email: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        stateCode: null,
        pincode: null,
        country: 'IN',
        logoUrl: null,
        invoiceLogoUrl: null,
        whatsappLogoUrl: null,
        brandColor: null,
        tagline: null,
        isVerified: false,
        verificationDate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: null,
        documents: [],
        localizations: [],
      };
      mockPrisma.storeProfile.findUnique.mockResolvedValue(dbProfile);

      const result = await storeProfileService.getProfile(tenantId);

      expect(mockPrisma.storeProfile.findUnique).toHaveBeenCalledWith({
        where: { tenantId_branchId: { tenantId, branchId: null } },
        include: expect.any(Object),
      });
      expect(result.storeName).toBe('Test Pharmacy');
    });

    it('should return null if profile not found and branch specified', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.storeProfile.findUnique.mockResolvedValue(null);

      const result = await storeProfileService.getProfile(tenantId, 'branch-1');

      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should reject invalid GSTIN', async () => {
      mockPrisma.storeProfile.findUnique.mockResolvedValue(null);

      await expect(
        storeProfileService.updateProfile(tenantId, { gstin: 'INVALID' }, userId)
      ).rejects.toThrow('GSTIN must be exactly 15 characters');
    });

    it('should reject invalid drug license format', async () => {
      mockPrisma.storeProfile.findUnique.mockResolvedValue(null);

      await expect(
        storeProfileService.updateProfile(tenantId, { drugLicenseNumber: 'INVALID-LICENSE' }, userId)
      ).rejects.toThrow('Invalid drug license format');
    });

    it('should reject invalid email', async () => {
      mockPrisma.storeProfile.findUnique.mockResolvedValue(null);

      await expect(
        storeProfileService.updateProfile(tenantId, { email: 'not-an-email' }, userId)
      ).rejects.toThrow('Invalid email format');
    });

    it('should normalize GSTIN to uppercase', async () => {
      mockPrisma.storeProfile.findUnique.mockResolvedValue(null);
      mockPrisma.storeProfile.create.mockResolvedValue({
        id: 'profile-1',
        tenantId,
        branchId: null,
        storeName: 'Test Pharmacy',
        gstin: '29ABCDE1234F1Z4',
        drugLicenseNumber: null,
        phoneNumber: null,
        email: null,
        addressLine1: null,
        addressLine2: null,
        city: null,
        state: null,
        stateCode: null,
        pincode: null,
        country: 'IN',
        logoUrl: null,
        invoiceLogoUrl: null,
        whatsappLogoUrl: null,
        brandColor: null,
        tagline: null,
        isVerified: false,
        verificationDate: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
        branch: null,
        documents: [],
        localizations: [],
      });
      mockPrisma.storeProfileVersion.count.mockResolvedValue(0);

      await storeProfileService.updateProfile(tenantId, { storeName: 'Test Pharmacy', gstin: '29abcde1234f1z4' }, userId);

      expect(mockPrisma.storeProfile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gstin: '29ABCDE1234F1Z4',
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('getVersions', () => {
    it('should return version history', async () => {
      const versions = [
        { id: 'v1', versionNumber: 1, snapshot: { storeName: 'Initial' } },
        { id: 'v2', versionNumber: 2, snapshot: { storeName: 'Updated' } },
      ];
      mockPrisma.storeProfileVersion.findMany.mockResolvedValue(versions);
      mockPrisma.storeProfileVersion.count.mockResolvedValue(2);

      const result = await storeProfileService.getVersions(tenantId, 'profile-1');

      expect(result.versions).toEqual(versions);
      expect(result.total).toBe(2);
    });
  });

  describe('getExpiringLicenses', () => {
    it('should return profiles with expiring licenses', async () => {
      const expiringProfiles = [
        { id: 'profile-1', storeName: 'Test Pharmacy', drugLicenseExpiry: new Date() },
      ];
      mockPrisma.storeProfile.findMany.mockResolvedValue(expiringProfiles);

      const result = await storeProfileService.getExpiringLicenses(tenantId, 30);

      expect(result).toEqual(expiringProfiles);
    });
  });
});
