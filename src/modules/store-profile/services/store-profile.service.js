import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import storeProfileRepository from '../repositories/store-profile.repository.js';
import settingsAuditRepository from '../../settings/gst/settings.audit.repository.js';
import { storeProfileEventEmitter, StoreProfileEvents } from '../events/store-profile.events.js';
import {
  validateGstin,
  validateDrugLicense,
  validatePan,
  validatePhone,
  validateEmail,
  validatePincode,
  validateLogoUrl,
} from '../validators/store-profile.validator.js';

class StoreProfileService {
  async getProfile(tenantId, branchId = null) {
    const cacheKey = `store_profile:${tenantId}:${branchId || 'global'}`;

    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      logger.warn({ err }, 'Redis cache read failed for store profile');
    }

    let profile = await storeProfileRepository.findByTenantId(tenantId, branchId);

    if (!profile && !branchId) {
      profile = await this._createDefaultProfile(tenantId);
    }

    if (!profile) {
      return null;
    }

    const result = this._formatProfile(profile);

    await this._cacheSet(cacheKey, result);
    return result;
  }

  async getAllBranchProfiles(tenantId) {
    return storeProfileRepository.findAllByTenant(tenantId);
  }

  async updateProfile(tenantId, data, changedBy = null, ipAddress = null) {
    const { branchId, ...profileData } = data;
    const targetBranchId = branchId || null;

    const existing = await storeProfileRepository.findByTenantId(tenantId, targetBranchId);

    if (existing) {
      await this._validateUpdates(existing, profileData);
    }

    const validationResult = this._validateAllFields(profileData);
    if (!validationResult.valid) {
      throw new Error(validationResult.error);
    }

    const normalizedData = this._normalizeData(profileData);

    let profile;
    if (existing) {
      const changedFields = this._detectChanges(existing, normalizedData);

      profile = await storeProfileRepository.update(existing.id, normalizedData);

      if (changedFields.length > 0) {
        const versionCount = await storeProfileRepository.getVersionCount(existing.id);
        await storeProfileRepository.createVersion(
          tenantId,
          existing.id,
          versionCount + 1,
          this._createSnapshot(existing, normalizedData),
          changedBy,
          `Updated: ${changedFields.join(', ')}`
        );

        await storeProfileEventEmitter.emit(StoreProfileEvents.STORE_PROFILE_VERSIONED, {
          tenantId,
          profileId: existing.id,
          versionNumber: versionCount + 1,
          changedFields,
          changedBy,
        });
      }

      await settingsAuditRepository.logChange({
        tenantId,
        settingKey: 'store_profile',
        action: 'UPDATED',
        branchId: targetBranchId,
        oldValue: this._formatProfile(existing),
        newValue: this._formatProfile(profile),
        changedBy,
        ipAddress,
      });

      if (changedFields.includes('gstin')) {
        await storeProfileEventEmitter.emit(StoreProfileEvents.GSTIN_CHANGED, {
          tenantId,
          profileId: existing.id,
          oldGstin: existing.gstin,
          newGstin: normalizedData.gstin,
        });
      }

      if (changedFields.includes('drugLicenseNumber') || changedFields.includes('drugLicenseExpiry')) {
        await storeProfileEventEmitter.emit(StoreProfileEvents.DRUG_LICENSE_UPDATED, {
          tenantId,
          profileId: existing.id,
          drugLicenseNumber: normalizedData.drugLicenseNumber,
          drugLicenseExpiry: normalizedData.drugLicenseExpiry,
        });
      }

      if (changedFields.some((f) => f.includes('Logo') || f === 'brandColor' || f === 'tagline')) {
        await storeProfileEventEmitter.emit(StoreProfileEvents.BRANDING_UPDATED, {
          tenantId,
          profileId: existing.id,
          changedFields,
        });
      }
    } else {
      profile = await storeProfileRepository.create(tenantId, {
        branchId: targetBranchId,
        ...normalizedData,
      });

      await storeProfileRepository.createVersion(
        tenantId,
        profile.id,
        1,
        this._createSnapshot(null, { branchId: targetBranchId, ...normalizedData }),
        changedBy,
        'Initial profile creation'
      );

      await settingsAuditRepository.logChange({
        tenantId,
        settingKey: 'store_profile',
        action: 'CREATED',
        branchId: targetBranchId,
        oldValue: null,
        newValue: this._formatProfile(profile),
        changedBy,
        ipAddress,
      });

      await storeProfileEventEmitter.emit(StoreProfileEvents.STORE_PROFILE_CREATED, {
        tenantId,
        profileId: profile.id,
        branchId: targetBranchId,
      });
    }

    await this.invalidateCache(tenantId, targetBranchId);

    await storeProfileEventEmitter.emit(StoreProfileEvents.STORE_PROFILE_UPDATED, {
      tenantId,
      profileId: profile.id,
      branchId: targetBranchId,
      changedBy,
    });

    return this._formatProfile(profile);
  }

  async uploadDocument(tenantId, profileId, data, uploadedBy = null) {
    const profile = await storeProfileRepository.findByTenantId(tenantId);
    if (!profile) {
      throw new Error('Store profile not found');
    }

    const document = await storeProfileRepository.createDocument(tenantId, profileId, {
      ...data,
      uploadedBy,
    });

    await storeProfileEventEmitter.emit(StoreProfileEvents.DOCUMENT_UPLOADED, {
      tenantId,
      profileId,
      documentId: document.id,
      documentType: data.documentType,
    });

    return document;
  }

  async getDocuments(tenantId, profileId, documentType = null) {
    return storeProfileRepository.getDocuments(profileId, tenantId, documentType);
  }

  async verifyDocument(tenantId, documentId, verifiedBy) {
    const document = await storeProfileRepository.verifyDocument(documentId, verifiedBy);

    await storeProfileEventEmitter.emit(StoreProfileEvents.DOCUMENT_VERIFIED, {
      tenantId,
      documentId,
      verifiedBy,
    });

    return document;
  }

  async getVersions(tenantId, profileId, limit = 50, offset = 0) {
    return storeProfileRepository.getVersions(profileId, limit, offset);
  }

  async restoreVersion(tenantId, versionId, changedBy = null) {
    const version = await storeProfileRepository.getVersionById(versionId, tenantId);
    if (!version) {
      throw new Error('Version not found');
    }

    const profile = await storeProfileRepository.findByTenantId(tenantId, version.snapshot.branchId || null);
    if (!profile) {
      throw new Error('Store profile not found');
    }

    const {restorableData} = version.snapshot;

    const updated = await storeProfileRepository.update(profile.id, restorableData);

    const versionCount = await storeProfileRepository.getVersionCount(profile.id);
    await storeProfileRepository.createVersion(
      tenantId,
      profile.id,
      versionCount + 1,
      this._createSnapshot(profile, restorableData),
      changedBy,
      `Restored from version ${version.versionNumber}`
    );

    await this.invalidateCache(tenantId, profile.branchId);

    return this._formatProfile(updated);
  }

  async updateLocalization(tenantId, profileId, language, data) {
    const profile = await storeProfileRepository.findByTenantId(tenantId);
    if (!profile) {
      throw new Error('Store profile not found');
    }

    const localization = await storeProfileRepository.upsertLocalization(tenantId, profileId, language, data);

    await storeProfileEventEmitter.emit(StoreProfileEvents.LOCALIZATION_UPDATED, {
      tenantId,
      profileId,
      language,
    });

    return localization;
  }

  async getLocalizations(tenantId, profileId) {
    return storeProfileRepository.getLocalizations(profileId, tenantId);
  }

  async getExpiringLicenses(tenantId, daysThreshold = 30) {
    return storeProfileRepository.getExpiringLicenses(tenantId, daysThreshold);
  }

  async invalidateCache(tenantId, branchId = null) {
    try {
      if (branchId) {
        await redisClient.del(`store_profile:${tenantId}:${branchId}`);
      } else {
        const keys = await redisClient.keys(`store_profile:${tenantId}:*`);
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      }

      await redisClient.del(`settings:${tenantId}:storeProfile:*`);
      await redisClient.del(`settings:${tenantId}:all:*`);

      await storeProfileEventEmitter.emit(StoreProfileEvents.CACHE_INVALIDATED, {
        tenantId,
        branchId,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to invalidate store profile cache');
    }
  }

  async _validateUpdates(existing, data) {
    if (data.gstin && data.gstin !== existing.gstin) {
      const duplicate = await storeProfileRepository.findByGstin(existing.tenantId, data.gstin);
      if (duplicate && duplicate.id !== existing.id) {
        throw new Error('GSTIN already in use by another branch profile');
      }
    }
  }

  _validateAllFields(data) {
    if (data.gstin !== undefined) {
      const gstinCheck = validateGstin(data.gstin);
      if (!gstinCheck.valid) return gstinCheck;
    }

    if (data.pan !== undefined) {
      const panCheck = validatePan(data.pan);
      if (!panCheck.valid) return panCheck;
    }

    if (data.drugLicenseNumber !== undefined) {
      const licenseCheck = validateDrugLicense(data.drugLicenseNumber);
      if (!licenseCheck.valid) return licenseCheck;
    }

    if (data.phoneNumber !== undefined) {
      const phoneCheck = validatePhone(data.phoneNumber);
      if (!phoneCheck.valid) return phoneCheck;
    }

    if (data.email !== undefined) {
      const emailCheck = validateEmail(data.email);
      if (!emailCheck.valid) return emailCheck;
    }

    if (data.supportEmail !== undefined) {
      const emailCheck = validateEmail(data.supportEmail);
      if (!emailCheck.valid) return emailCheck;
    }

    if (data.pincode !== undefined) {
      const pincodeCheck = validatePincode(data.pincode);
      if (!pincodeCheck.valid) return pincodeCheck;
    }

    if (data.logoUrl !== undefined) {
      const logoCheck = validateLogoUrl(data.logoUrl);
      if (!logoCheck.valid) return logoCheck;
    }

    if (data.invoiceLogoUrl !== undefined) {
      const logoCheck = validateLogoUrl(data.invoiceLogoUrl);
      if (!logoCheck.valid) return logoCheck;
    }

    if (data.whatsappLogoUrl !== undefined) {
      const logoCheck = validateLogoUrl(data.whatsappLogoUrl);
      if (!logoCheck.valid) return logoCheck;
    }

    return { valid: true, error: null };
  }

  _normalizeData(data) {
    const normalized = { ...data };

    if (normalized.gstin) {
      normalized.gstin = normalized.gstin.trim().toUpperCase();
    }

    if (normalized.pan) {
      normalized.pan = normalized.pan.trim().toUpperCase();
    }

    if (normalized.drugLicenseNumber) {
      normalized.drugLicenseNumber = normalized.drugLicenseNumber.trim();
    }

    if (normalized.email) {
      normalized.email = normalized.email.trim().toLowerCase();
    }

    if (normalized.supportEmail) {
      normalized.supportEmail = normalized.supportEmail.trim().toLowerCase();
    }

    if (normalized.pincode) {
      normalized.pincode = normalized.pincode.trim();
    }

    return normalized;
  }

  _detectChanges(existing, newData) {
    const changedFields = [];
    const fieldsToTrack = [
      'storeName', 'legalName', 'tradeName', 'gstin', 'pan',
      'drugLicenseNumber', 'drugLicenseExpiry', 'fssaiLicense', 'fssaiLicenseExpiry',
      'phoneNumber', 'alternatePhone', 'email', 'supportEmail', 'website',
      'addressLine1', 'addressLine2', 'city', 'state', 'stateCode', 'pincode', 'country',
      'logoUrl', 'invoiceLogoUrl', 'whatsappLogoUrl', 'brandColor', 'tagline',
    ];

    for (const field of fieldsToTrack) {
      const existingVal = existing[field];
      const newVal = newData[field];
      if (existingVal !== newVal) {
        changedFields.push(field);
      }
    }

    return changedFields;
  }

  _createSnapshot(existing, newData) {
    if (existing) {
      return { ...existing, ...newData };
    }
    return { ...newData };
  }

  _formatProfile(profile) {
    return {
      id: profile.id,
      branchId: profile.branchId,
      branch: profile.branch,
      storeName: profile.storeName,
      legalName: profile.legalName,
      tradeName: profile.tradeName,
      gstin: profile.gstin,
      pan: profile.pan,
      drugLicenseNumber: profile.drugLicenseNumber,
      drugLicenseExpiry: profile.drugLicenseExpiry,
      fssaiLicense: profile.fssaiLicense,
      fssaiLicenseExpiry: profile.fssaiLicenseExpiry,
      phoneNumber: profile.phoneNumber,
      alternatePhone: profile.alternatePhone,
      email: profile.email,
      supportEmail: profile.supportEmail,
      website: profile.website,
      address: {
        line1: profile.addressLine1,
        line2: profile.addressLine2,
        city: profile.city,
        state: profile.state,
        stateCode: profile.stateCode,
        pincode: profile.pincode,
        country: profile.country,
      },
      logoUrl: profile.logoUrl,
      invoiceLogoUrl: profile.invoiceLogoUrl,
      whatsappLogoUrl: profile.whatsappLogoUrl,
      brandColor: profile.brandColor,
      tagline: profile.tagline,
      isVerified: profile.isVerified,
      verificationDate: profile.verificationDate,
      status: profile.status,
      documents: profile.documents || [],
      localizations: profile.localizations || [],
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  async _createDefaultProfile(tenantId) {
    const profile = await storeProfileRepository.create(tenantId, {
      storeName: 'My Pharmacy',
      country: 'IN',
    });

    await storeProfileRepository.createVersion(
      tenantId,
      profile.id,
      1,
      this._createSnapshot(null, { storeName: 'My Pharmacy', country: 'IN' }),
      null,
      'Default profile creation'
    );

    return profile;
  }

  async _cacheSet(key, value) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', 3600);
    } catch (err) {
      logger.warn({ err }, 'Redis cache write failed for store profile');
    }
  }
}

export default new StoreProfileService();
