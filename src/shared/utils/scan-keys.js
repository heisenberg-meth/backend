import redisClient from '../../config/redis.js';

export async function scanKeys(pattern, { count = 100 } = {}) {
  const results = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = nextCursor;
    results.push(...keys);
  } while (cursor !== '0');

  return results;
}
