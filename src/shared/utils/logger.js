import pino from 'pino';
import env from '../../config/env.js';

const isDev = env.nodeEnv === 'development';

const logger = pino({
  level: env.logLevel || 'info',

  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
          },
        },
      }
    : {}),
});

export default logger;
