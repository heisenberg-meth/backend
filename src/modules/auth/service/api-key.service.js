import crypto from 'crypto';
import redis from '../../../config/redis.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

const API_KEY_PREFIX = 'vma_pat_';

class ApiKeyService {
  /**
   * Generates a new Personal Access Token (PAT) or scoped machine API key.
   */
  async createApiKey({ userId, tenantId, name, scopes = ['*'], expiresInDays = 30 }) {
    if (!userId || !tenantId || !name) {
      throw new Error('User ID, Tenant ID, and Key Name are required');
    }

    const secretPart = crypto.randomBytes(24).toString('hex');
    const plaintextKey = `${API_KEY_PREFIX}${secretPart}`;
    const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');
    const keyId = crypto.randomUUID();

    const now = Date.now();
    const ttlSeconds = Math.max(86400, expiresInDays * 86400);
    const expiresAt = new Date(now + ttlSeconds * 1000).toISOString();

    const record = {
      id: keyId,
      name,
      userId,
      tenantId,
      scopes,
      keyHash,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    };

    // Store primary lookup map
    await redis.set(`auth:apikey:${keyHash}`, JSON.stringify(record), 'EX', ttlSeconds);

    // Maintain index for user key listing
    const userIndexKey = `auth:apikeys:user:${userId}`;
    const existingIndex = await redis.get(userIndexKey).catch(() => null);
    const indexList = existingIndex ? JSON.parse(existingIndex) : [];

    // Store metadata (without secret hash)
    indexList.push({
      id: keyId,
      name,
      scopes,
      keyHash, // needed for revocation lookup
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });

    await redis.set(userIndexKey, JSON.stringify(indexList));

    logger.info(
      { userId, tenantId, keyId, name, scopes },
      'Enterprise Personal Access Token issued',
    );
    eventBus.publish('ApiKeyIssued', { userId, tenantId, keyId, name });

    return {
      apiKey: plaintextKey,
      metadata: {
        id: keyId,
        name,
        scopes,
        expiresAt,
      },
    };
  }

  /**
   * Verifies an incoming API key string against persistence.
   */
  async verifyApiKey(apiKeyString) {
    if (!apiKeyString || !apiKeyString.startsWith(API_KEY_PREFIX)) {
      const err = new Error('Invalid API Key format');
      err.code = AUTH_ERRORS.AUTH_UNAUTHORIZED;
      throw err;
    }

    const keyHash = crypto.createHash('sha256').update(apiKeyString).digest('hex');
    const cached = await redis.get(`auth:apikey:${keyHash}`).catch(() => null);

    if (!cached) {
      logger.warn(
        { keyPrefix: apiKeyString.substring(0, 12) },
        'API Key authentication failed: Key revoked or expired',
      );
      const err = new Error('Invalid or expired API Key');
      err.code = AUTH_ERRORS.AUTH_UNAUTHORIZED;
      throw err;
    }

    let record;
    try {
      record = JSON.parse(cached);
    } catch (e) {
      throw new Error('Corrupted API Key record', e);
    }

    if (new Date(record.expiresAt).getTime() < Date.now()) {
      await redis.del(`auth:apikey:${keyHash}`);
      throw new Error('API Key has expired');
    }

    return {
      valid: true,
      userId: record.userId,
      tenantId: record.tenantId,
      scopes: record.scopes,
      keyId: record.id,
    };
  }

  /**
   * Lists active API keys for a user.
   */
  async listUserApiKeys(userId) {
    if (!userId) return [];
    const cached = await redis.get(`auth:apikeys:user:${userId}`).catch(() => null);
    if (!cached) return [];

    try {
      const list = JSON.parse(cached);
      const now = Date.now();
      return list
        .filter((k) => new Date(k.expiresAt).getTime() > now)
        .map(({ id, name, scopes, createdAt, expiresAt }) => ({
          id,
          name,
          scopes,
          createdAt,
          expiresAt,
        }));
    } catch (e) {
      logger.error({ error: e }, 'Failed to list API keys');
      return [];
    }
  }

  /**
   * Revokes an API key by ID.
   */
  async revokeApiKey({ userId, keyId }) {
    const userIndexKey = `auth:apikeys:user:${userId}`;
    const cached = await redis.get(userIndexKey).catch(() => null);
    if (!cached) throw new Error('No active API keys found');

    let list = JSON.parse(cached);
    const target = list.find((k) => k.id === keyId);
    if (!target) throw new Error('API key not found');

    // Delete primary hash lookup
    await redis.del(`auth:apikey:${target.keyHash}`);

    // Update index
    list = list.filter((k) => k.id !== keyId);
    await redis.set(userIndexKey, JSON.stringify(list));

    logger.info({ userId, keyId }, 'Personal Access Token revoked');
    eventBus.publish('ApiKeyRevoked', { userId, keyId });

    return { success: true, revokedKeyId: keyId };
  }
}

export default new ApiKeyService();
