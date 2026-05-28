import pino from 'pino';
import env from '../../config/env.js';

const isDev = env.nodeEnv === 'development' || !env.nodeEnv;

const logger = pino({
  level: env.logLevel || 'info',
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
});

export default logger;
