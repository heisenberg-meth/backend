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
      retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
      reconnectOnError(err) {
        logger.warn({ err: err.message }, 'Redis reconnectOnError');
        return true;
      },
    });

    if (process.env.NODE_ENV !== 'test') {
      activeClient.on('connect', () => {
        logger.info('Redis client connected');
      });

      activeClient.on('error', (err) => {
        if (activeClient && activeClient.status !== 'end') {
          logger.warn({ err: err.message }, 'Redis error (non-fatal)');
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
    return client;
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis startup verification failed - running without cache');
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
