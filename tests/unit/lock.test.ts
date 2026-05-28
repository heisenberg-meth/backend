import { describe, it, expect, afterEach, jest } from '@jest/globals';

const mockRedis = {
  set: jest.fn<
    (
      key: string,
      value: string,
      mode: string,
      ttl: number,
      nx: string
    ) => Promise<string | null>
  >(),

  del: jest.fn<(key: string) => Promise<number>>(),
};

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  initRedis: () => mockRedis,
  quitRedis: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  default: mockRedis,
}));

const { acquireLock, releaseLock } = await import(
  '../../src/shared/utils/lock.js'
);

describe('Lock Utility (Unit)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should acquire a lock if Redis returns OK', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await acquireLock('test-resource', 1000);

    expect(result).toBe(true);

    expect(mockRedis.set).toHaveBeenCalledWith(
      'lock:test-resource',
      'locked',
      'PX',
      1000,
      'NX'
    );
  });

  it('should fail to acquire a lock if Redis returns null', async () => {
    mockRedis.set.mockResolvedValue(null);

    const result = await acquireLock('test-resource', 1000);

    expect(result).toBe(false);
  });

  it('should release a lock', async () => {
    await releaseLock('test-resource');

    expect(mockRedis.del).toHaveBeenCalledWith(
      'lock:test-resource'
    );
  });
});
