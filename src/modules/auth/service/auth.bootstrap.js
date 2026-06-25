import env from '../../../config/env.js';
import prisma from '../../../config/prisma.js';
import redis from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import cookieManager from '../../../shared/services/cookie-manager.service.js';

export async function validateAuthConfigOnStartup() {
  logger.info('Running mandatory Authentication Startup Validation...');

  const errors = [];

  if (!env.nodeEnv) errors.push('NODE_ENV missing');
  if (!env.frontendUrl) errors.push('FRONTEND_URL missing');
  if (!env.cookieSecret) errors.push('COOKIE_SECRET missing');
  if (!env.jwtSecrets || !env.jwtSecrets.length || !env.jwtSecrets[0])
    errors.push('JWT_SECRET missing');
  if (!env.redis?.url) errors.push('REDIS_URL missing');

  try {
    cookieManager.validateConfiguration();
  } catch (err) {
    errors.push(err.message);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    errors.push(`Database unreachable during auth validation: ${err.message}`);
  }

  try {
    await redis.ping();
  } catch (err) {
    errors.push(`Redis unreachable during auth validation: ${err.message}`);
  }

  if (errors.length > 0) {
    logger.error({ errors }, 'Authentication Configuration Invalid. Aborting Startup.');
    console.error('\n======================================================');
    console.error('FATAL: Authentication Prerequisites Validation Failed:');
    errors.forEach((e) => console.error(` - ${e}`));
    console.error('======================================================\n');
    throw new Error(`Authentication Configuration Invalid: ${errors.join(', ')}`);
  }

  logger.info('Authentication Startup Validation passed successfully.');
}
