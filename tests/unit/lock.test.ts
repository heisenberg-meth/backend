import { describe, it, expect, afterEach, jest } from '@jest/globals';

const mockRedis = {
  set: jest.fn<
    (key: string, value: string, mode: string, ttl: number, nx: string) => Promise<string | null>
  >(),

  del: jest.fn<(key: string) => Promise<number>>(),
  pexpire: jest.fn<(key: string, ttl: number) => Promise<number>>(),
};

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  initRedis: () => mockRedis,
  quitRedis: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  default: mockRedis,
}));

const { acquireLock, extendLock, startLockHeartbeat, releaseLock } =
  await import('../../src/shared/utils/lock.js');

describe('Lock Utility (Unit)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should acquire a lock if Redis returns OK', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await acquireLock('test-resource', 1000);

    expect(result).toBe(true);

    expect(mockRedis.set).toHaveBeenCalledWith('lock:test-resource', 'locked', 'PX', 1000, 'NX');
  });

  it('should fail to acquire a lock if Redis returns null', async () => {
    mockRedis.set.mockResolvedValue(null);

    const result = await acquireLock('test-resource', 1000);

    expect(result).toBe(false);
  });

  it('should extend a lock if Redis pexpire returns 1', async () => {
    mockRedis.pexpire.mockResolvedValue(1);

    const result = await extendLock('test-resource', 5000);

    expect(result).toBe(true);
    expect(mockRedis.pexpire).toHaveBeenCalledWith('lock:test-resource', 5000);
  });

  it('should return false if Redis pexpire returns 0', async () => {
    mockRedis.pexpire.mockResolvedValue(0);

    const result = await extendLock('test-resource', 5000);

    expect(result).toBe(false);
  });

  it('should start and stop a lock heartbeat timer', () => {
    mockRedis.pexpire.mockResolvedValue(1);
    jest.useFakeTimers();

    const stopHeartbeat = startLockHeartbeat('test-resource', 2000, 1000);
    expect(typeof stopHeartbeat).toBe('function');

    jest.advanceTimersByTime(1000);
    expect(mockRedis.pexpire).toHaveBeenCalledWith('lock:test-resource', 2000);

    stopHeartbeat();
    jest.advanceTimersByTime(2000);
    expect(mockRedis.pexpire).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('should release a lock', async () => {
    await releaseLock('test-resource');

    expect(mockRedis.del).toHaveBeenCalledWith('lock:test-resource');
  });
});
