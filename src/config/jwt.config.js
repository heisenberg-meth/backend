import env from './env.js';

const resolvedRefreshSecrets =
  env.refreshSecrets.length > 0
    ? env.refreshSecrets
    : env.nodeEnv !== 'production'
      ? env.jwtSecrets
      : [];

export const JWT_CONFIG = {
  secret: env.jwtSecrets[0],

  secrets: env.jwtSecrets,

  refreshSecret: resolvedRefreshSecrets[0],

  refreshSecrets: resolvedRefreshSecrets,

  accessToken: {
    expiresIn: '15m',
    algorithm: 'HS256',
  },

  refreshToken: {
    expiresIn: '30d',
    algorithm: 'HS256',
  },

  resetToken: {
    expiresIn: '5m',
    algorithm: 'HS256',
  },

  // Fastify JWT plugin options
  fastifyPluginOptions: {
    secret: env.jwtSecrets[0],
    sign: {
      expiresIn: '15m',
      algorithm: 'HS256',
    },
    verify: {
      algorithms: ['HS256'],
    },
  },
};
