import { describe, it, expect, afterEach, jest } from '@jest/globals';

const mockRedis = {
  set: jest.fn<
    (key: string, value: string, mode: string, ttl: number, nx: string) => Promise<string | null>
  >(),

  del: jest.fn<(key: string) => Promise<number>>(),
  pexpire: jest.fn<(key: string, ttl: number) => Promise<number>>(),
  eval: jest.fn<
    (script: string, numkeys: number, ...args: (string | number)[]) => Promise<number>
  >(),
  get: jest.fn<(key: string) => Promise<string | null>>(),
};

jest.unstable_mockModule('../../src/config/redis.js', () => ({
  initRedis: () => mockRedis,
  quitRedis: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  default: mockRedis,
}));

const { acquireLock, extendLock, startLockHeartbeat, releaseLock, getLockToken } =
  await import('../../src/shared/utils/lock.js');

describe('Lock Utility (Unit)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should acquire a lock with a generated token if Redis returns OK', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await acquireLock('test-resource', 1000);

    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'lock:test-resource',
      expect.any(String),
      'PX',
      1000,
      'NX',
    );
    expect(getLockToken('test-resource')).toBeDefined();
  });

  it('should acquire a lock with a custom token if provided', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await acquireLock('test-resource-custom', 1000, 'my-custom-token');

    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'lock:test-resource-custom',
      'my-custom-token',
      'PX',
      1000,
      'NX',
    );
    expect(getLockToken('test-resource-custom')).toBe('my-custom-token');
  });

  it('should fail to acquire a lock if Redis returns null', async () => {
    mockRedis.set.mockResolvedValue(null);

    const result = await acquireLock('test-resource-fail', 1000);

    expect(result).toBe(false);
  });

  it('should extend a lock using Lua script if ownership token matches', async () => {
    mockRedis.eval.mockResolvedValue(1);

    const result = await extendLock('test-resource', 5000, 'token-123');

    expect(result).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1]) == ARGV[1]'),
      1,
      'lock:test-resource',
      'token-123',
      5000,
    );
  });

  it('should fail to extend a lock if ownership token does not match in Redis', async () => {
    mockRedis.eval.mockResolvedValue(0);

    const result = await extendLock('test-resource', 5000, 'token-123');

    expect(result).toBe(false);
  });

  it('should not extend a lock if no ownership token is known', async () => {
    const result = await extendLock('unknown-resource', 5000);

    expect(result).toBe(false);
    expect(mockRedis.pexpire).not.toHaveBeenCalled();
  });

  it('should start and stop a lock heartbeat timer', () => {
    mockRedis.eval.mockResolvedValue(1);
    jest.useFakeTimers();

    const stopHeartbeat = startLockHeartbeat('test-resource', 2000, 1000, 'token-123');
    expect(typeof stopHeartbeat).toBe('function');

    jest.advanceTimersByTime(1000);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1]) == ARGV[1]'),
      1,
      'lock:test-resource',
      'token-123',
      2000,
    );

    stopHeartbeat();
    jest.advanceTimersByTime(2000);
    expect(mockRedis.eval).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('should stop heartbeat when lock ownership is lost', async () => {
    jest.useFakeTimers();

    mockRedis.eval.mockResolvedValue(0);

    const stopHeartbeat = startLockHeartbeat('lost-resource', 2000, 1000, 'token-123');

    await jest.advanceTimersByTimeAsync(1000);

    expect(mockRedis.eval).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3000);

    expect(mockRedis.eval).toHaveBeenCalledTimes(1);

    stopHeartbeat();
    jest.useRealTimers();
  });

  it('should release a lock using atomic Lua script when ownership token is known', async () => {
    mockRedis.eval.mockResolvedValue(1);

    const released = await releaseLock('test-resource-custom', 'my-custom-token');

    expect(released).toBe(true);
    expect(mockRedis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("del", KEYS[1])'),
      1,
      'lock:test-resource-custom',
      'my-custom-token',
    );
    expect(getLockToken('test-resource-custom')).toBeNull();
  });

  it('should not release a lock if no ownership token is known', async () => {
    const released = await releaseLock('unknown-resource');

    expect(released).toBe(false);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});
