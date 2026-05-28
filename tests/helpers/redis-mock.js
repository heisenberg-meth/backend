import jest from 'jest';

export const createRedisMock = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  scan: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  incr: jest.fn(),
  sadd: jest.fn(),
  srem: jest.fn(),
  smembers: jest.fn(),
  hget: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn(),
  hgetall: jest.fn(),
  pipeline: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  ping: jest.fn().mockResolvedValue('PONG'),
  on: jest.fn(),
  status: 'ready',
  quit: jest.fn().mockResolvedValue(),
  disconnect: jest.fn(),
  duplicate: jest.fn(),
});

export const createRedisModuleMock = (overrides = {}) => {
  const mockClient = { ...createRedisMock(), ...overrides };
  return {
    default: mockClient,
    initRedis: jest.fn(() => mockClient),
    connectRedis: jest.fn(),
    quitRedis: jest.fn().mockResolvedValue(),
    getBullRedis: jest.fn(() => mockClient),
    ...Object.fromEntries(
      Object.entries(overrides).filter(([k]) => !['default', 'initRedis', 'connectRedis', 'quitRedis', 'getBullRedis'].includes(k))
    ),
  };
};
