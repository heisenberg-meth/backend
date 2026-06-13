import Redis from 'ioredis';
import logger from '../shared/utils/logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let activeClient = null;

const bullRedisClients = [];

const getActiveClient = () => {
  if (!activeClient || activeClient.status === 'end') {
    activeClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    if (process.env.NODE_ENV !== 'test') {
      activeClient.on('connect', () => {
        logger.info('Redis client connected');
      });

      activeClient.on('error', (err) => {
        if (activeClient && activeClient.status !== 'end') {
          logger.error({ err }, 'Redis error');
        }
      });
    }
  }
  return activeClient;
};

const redisClientProxy = new Proxy(
  {},
  {
    get(target, prop) {
      const client = getActiveClient();
      const value = client[prop];
      if (typeof value === 'function') {
        return value.bind(client);
      }
      return value;
    },
    set(target, prop, value) {
      const client = getActiveClient();
      client[prop] = value;
      return true;
    },
  },
);

const getBullRedis = () => {
  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  });
  bullRedisClients.push(client);
  return client;
};

export const initRedis = () => getActiveClient();
export { getBullRedis };

export const connectRedis = async () => {
  try {
    const client = getActiveClient();
    await client.ping();
    logger.info('Redis startup verification successful (PONG)');
    try {
      await client.config('SET', 'maxmemory-policy', 'noeviction');
      logger.info('Redis maxmemory-policy set to noeviction successfully');
    } catch (configErr) {
      logger.warn(
        { err: configErr },
        'Failed to set Redis maxmemory-policy to noeviction dynamically',
      );
    }
    return client;
  } catch (err) {
    logger.error({ err }, 'Redis startup verification failed');
  }
};

export const quitRedis = async () => {
  for (const client of bullRedisClients) {
    if (client.status !== 'end') {
      try {
        client.removeAllListeners();
        await client.quit();
      } catch (err) {
        logger.error({ err }, 'Redis client quit failed');
      }
    }
  }
  bullRedisClients.length = 0;

  if (activeClient && activeClient.status !== 'end') {
    try {
      activeClient.removeAllListeners();
      await activeClient.quit();
      logger.info('Redis disconnected');
    } catch (err) {
      if (err.message !== 'Connection is closed.') {
        throw err;
      }
    } finally {
      activeClient = null;
    }
  }
};

export default redisClientProxy;
