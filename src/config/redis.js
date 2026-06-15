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
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
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

      activeClient.on('reconnecting', () => {
        logger.warn('Redis reconnecting');
      });

      activeClient.on('error', (err) => {
        if (activeClient && activeClient.status !== 'end') {
          logger.error({ err: err.message }, 'Redis error');
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
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 100, 3000);
    },
    reconnectOnError(err) {
      logger.warn({ err: err.message }, 'Bull Redis reconnectOnError');
      return true;
    },
  });

  if (process.env.NODE_ENV !== 'test') {
    client.on('connect', () => {
      logger.info('Bull Redis connected');
    });
    client.on('reconnecting', () => {
      logger.warn('Bull Redis reconnecting');
    });
    client.on('error', (err) => {
      logger.error({ err: err.message }, 'Bull Redis error');
    });
  }

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
      logger.info('Redis eviction policy set to noeviction');
    } catch (configErr) {
      logger.warn({ err: configErr.message }, 'Failed to set Redis maxmemory-policy');
    }

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
