/**
 * notification.queues.js
 *
 * One BullMQ queue per channel (mirrors the "channel" field on Notification:
 * IN_APP, SMS, EMAIL, WHATSAPP, PUSH). Separate queues let each channel scale
 * and retry independently — an SMS provider outage doesn't block in-app delivery.
 *
 * Retry config is read from NotificationSettings per tenant at enqueue time
 * (maxRetries, retryBackoffStrategy, cooldownMinutes) rather than hardcoded,
 * since your schema already makes these tenant-configurable.
 */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
});

const defaultJobOptions = {
  removeOnComplete: { age: 3600, count: 1000 }, // keep 1hr / last 1000 for debugging
  removeOnFail: false, // keep failed jobs until DLQ worker processes them
};

export const queues = {
  IN_APP: new Queue('notifications_in_app', { connection, defaultJobOptions }),
  SMS: new Queue('notifications_sms', { connection, defaultJobOptions }),
  EMAIL: new Queue('notifications_email', { connection, defaultJobOptions }),
  WHATSAPP: new Queue('notifications_whatsapp', { connection, defaultJobOptions }),
  PUSH: new Queue('notifications_push', { connection, defaultJobOptions }),
};

export function getQueueForChannel(channel) {
  const queue = queues[channel];
  if (!queue) throw new Error(`No queue configured for channel: ${channel}`);
  return queue;
}

/**
 * BullMQ backoff type accepted by Job options.
 * Maps NotificationSettings.retryBackoffStrategy ("exponential" | "fixed")
 * to BullMQ's native backoff config.
 */
export function buildBackoffConfig(settings) {
  const strategy = settings?.retryBackoffStrategy === 'fixed' ? 'fixed' : 'exponential';
  return {
    type: strategy,
    delay: strategy === 'exponential' ? 2000 : (settings?.cooldownMinutes ?? 30) * 60_000,
  };
}
