import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import env from './env.js';

const SENTRY_DSN = env.sentry?.dsn || process.env.SENTRY_DSN;

export const initSentry = (app) => {
  if (!SENTRY_DSN) {
    console.warn('[Sentry] SENTRY_DSN not configured, Sentry disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: env.nodeEnv || 'development',
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: env.nodeEnv === 'production' ? 0.1 : 1.0,
    profilesSampleRate: env.nodeEnv === 'production' ? 0.1 : 1.0,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  app.addHook('onError', async (request, reply, error) => {
    Sentry.withScope((scope) => {
      scope.setTag('tenantId', request.tenantId || 'unknown');
      scope.setTag('userId', request.user?.id || 'unknown');
      scope.setTag('endpoint', request.routerPath || request.url);
      scope.setExtra('requestId', request.id);
      scope.setExtra('method', request.method);
      scope.setExtra('query', request.query);
      scope.setExtra('params', request.params);
      Sentry.captureException(error);
    });
  });

  app.addHook('onResponse', async (request, reply) => {
    if (reply.statusCode >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag('tenantId', request.tenantId || 'unknown');
        scope.setTag('endpoint', request.routerPath || request.url);
        scope.setExtra('statusCode', reply.statusCode);
        scope.setExtra('method', request.method);
        Sentry.captureMessage(
          `${request.method} ${request.url} returned ${reply.statusCode}`,
          'error',
        );
      });
    }
  });

  console.log('[Sentry] Error tracking initialized');
};
