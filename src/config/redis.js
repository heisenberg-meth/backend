import Redis from 'ioredis';
import logger from '../shared/utils/logger.js';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let activeClient = null;
let sharedBullQueueClient = null;

const bullRedisClients = [];

const getActiveClient = () => {
  if (!activeClient || activeClient.status === 'end') {
    activeClient = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      enableReadyCheck: true,
      retryStrategy(times) {
        if (times > 10) {
          logger.error('Redis max retries reached, giving up');
          return null;
        }
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

      activeClient.on('ready', () => {
        logger.info('Redis client ready');
      });

      activeClient.on('reconnecting', () => {
        logger.warn('Redis reconnecting');
      });

      activeClient.on('error', (err) => {
        if (activeClient && activeClient.status !== 'end') {
          logger.warn({ err: err.message }, 'Redis error');
        }
      });

      activeClient.on('close', () => {
        logger.warn('Redis connection closed');
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
  const isWorker = new Error().stack.includes('Worker');

  if (!isWorker && sharedBullQueueClient && sharedBullQueueClient.status !== 'end') {
    return sharedBullQueueClient;
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 10) {
        logger.error('Bull Redis max retries reached, giving up');
        return null;
      }
      return Math.min(times * 100, 3000);
    },
    reconnectOnError(err) {
      logger.warn({ err: err.message }, 'Bull Redis reconnectOnError');
      return true;
    },
  });

  if (process.env.NODE_ENV !== 'test') {
    client.on('connect', () => {
      logger.info(
        isWorker ? 'Bull Redis connected (Worker)' : 'Bull Redis connected (Shared Queue)',
      );
    });
    client.on('ready', () => {
      logger.info(isWorker ? 'Bull Redis ready (Worker)' : 'Bull Redis ready (Shared Queue)');
    });
    client.on('reconnecting', () => {
      logger.warn(
        isWorker ? 'Bull Redis reconnecting (Worker)' : 'Bull Redis reconnecting (Shared Queue)',
      );
    });
    client.on('error', (err) => {
      logger.warn({ err: err.message }, 'Bull Redis error');
    });
    client.on('close', () => {
      logger.warn(isWorker ? 'Bull Redis closed (Worker)' : 'Bull Redis closed (Shared Queue)');
    });
  }

  bullRedisClients.push(client);

  if (!isWorker && !sharedBullQueueClient) {
    sharedBullQueueClient = client;
  }

  return client;
};

export const initRedis = () => getActiveClient();
export { getBullRedis };

export const connectRedis = async () => {
  const startTime = Date.now();
  try {
    const client = getActiveClient();
    await client.ping();
    logger.info(
      { duration: Date.now() - startTime },
      'REDIS_CONNECTED: Redis startup verification successful (PONG)',
    );
    logger.info('REDIS_HEALTH_CHECK: Passed');

    try {
      const [policyConfig, maxMemoryConfig, info] = await Promise.all([
        client.config('GET', 'maxmemory-policy'),
        client.config('GET', 'maxmemory'),
        client.info('server'),
      ]);

      let policy = 'unknown';
      if (Array.isArray(policyConfig)) {
        policy = policyConfig[1];
      } else if (policyConfig && policyConfig['maxmemory-policy']) {
        policy = policyConfig['maxmemory-policy'];
      }

      let maxMemory = 'unknown';
      if (Array.isArray(maxMemoryConfig)) {
        maxMemory = maxMemoryConfig[1];
      } else if (maxMemoryConfig && maxMemoryConfig['maxmemory']) {
        maxMemory = maxMemoryConfig['maxmemory'];
      }

      let redisVersion = 'unknown';
      const versionMatch = info.match(/redis_version:([0-9.]+)/);
      if (versionMatch) {
        redisVersion = versionMatch[1];
      }

      logger.info({ policy, maxMemory, redisVersion }, 'REDIS_CONFIGURATION_VERIFIED');

      if (policy && policy !== 'noeviction') {
        logger.warn(
          { currentPolicy: policy, expectedPolicy: 'noeviction' },
          `REDIS_CONFIGURATION_WARNING: Eviction policy is ${policy}. Recommendation: Configure noeviction in Redis server. Application continuing normally.`,
        );
      }
    } catch (configErr) {
      if (
        configErr.message.includes('NOPERM') ||
        configErr.message.includes('ERR unknown command')
      ) {
        logger.warn(
          'REDIS_CONFIGURATION_WARNING: Insufficient permissions to read Redis config (Managed Redis). Application continuing normally.',
        );
      } else {
        logger.warn(
          { err: configErr.message },
          'REDIS_CONFIGURATION_WARNING: Failed to verify Redis configuration. Application continuing normally.',
        );
      }
    }

    logger.info('REDIS_STARTUP_COMPLETED: Application continuing normally.');
    return client;
  } catch (err) {
    logger.error(
      { err: err.message },
      'REDIS_HEALTH_CHECK: Redis startup verification failed. Connectivity error.',
    );
    throw err;
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
