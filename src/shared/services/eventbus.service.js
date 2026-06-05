import amqp from 'amqplib';
import env from '../../config/env.js';
import logger from '../../shared/utils/logger.js';

class EventBus {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.exchangeName = 'viyan_events';
    this.connecting = false;
    this.closing = false;
  }

  async connect() {
    if (!env.rabbitmq.enabled) {
      logger.info('[EVENTBUS] RabbitMQ is disabled via config');
      return;
    }
    if (this.connection || this.connecting) return;

    this.connecting = true;
    const retryLimit = 5;
    let attempt = 0;

    while (attempt < retryLimit && !this.closing) {
      try {
        logger.info(
          `[EVENTBUS] Connecting to RabbitMQ at ${env.rabbitmq.url} (Attempt ${attempt + 1})...`,
        );
        this.connection = await amqp.connect(env.rabbitmq.url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });

        this.connection.on('error', (err) => {
          logger.error({ err }, '[EVENTBUS] Connection error');
          this.connection = null;
          this.channel = null;
        });

        this.connection.on('close', () => {
          if (!this.closing) {
            logger.warn('[EVENTBUS] Connection closed. Attempting to reconnect...');
            this.connection = null;
            this.channel = null;
            this.connect();
          }
        });

        logger.info('[EVENTBUS] Connected to RabbitMQ');
        this.connecting = false;
        return;
      } catch (error) {
        attempt++;
        if (attempt >= retryLimit) {
          logger.error({ error }, '[EVENTBUS] Max retry limit reached. RabbitMQ unavailable.');
          this.connecting = false;
          return;
        }

        // Wait before next retry, but allow shutdown to interrupt
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 5000);
          if (t.unref) t.unref();
        });
      }
    }
    this.connecting = false;
  }

  async disconnect() {
    this.closing = true;
    if (this.connection) {
      this.connection.removeAllListeners();
      await this.connection.close();
      this.connection = null;
      this.channel = null;
      logger.info('[EVENTBUS] Connection closed gracefully');
    }
  }

  async publish(routingKey, message) {
    if (!env.rabbitmq.enabled) return;

    // If not connected and not connecting, try to connect in background
    if (!this.channel && !this.connecting) {
      this.connect(); // Fire and forget connection
    }

    // If still no channel, we can't publish.
    // We don't block the caller (like the payment API) for 20 seconds.
    if (!this.channel) {
      logger.warn(`[EVENTBUS] Skipping event publish (not connected): ${routingKey}`);
      return;
    }

    try {
      const { sanitizeRedisPayload } = await import('../utils/sanitize-redis-payload.js');
      const safePayload = sanitizeRedisPayload(message);
      const payload = Buffer.from(JSON.stringify(safePayload));
      this.channel.publish(this.exchangeName, routingKey, payload, { persistent: true });
      logger.info(`[EVENTBUS] Published event: ${routingKey}`);
    } catch (error) {
      logger.error({ error }, `[EVENTBUS] Failed to publish event: ${routingKey}`);
    }
  }

  async subscribe(queueName, routingKey, handler) {
    if (!env.rabbitmq.enabled) return;
    if (!this.channel) await this.connect();
    if (!this.channel) return;
    try {
      const q = await this.channel.assertQueue(queueName, { durable: true });
      await this.channel.bindQueue(q.queue, this.exchangeName, routingKey);

      this.channel.consume(q.queue, async (msg) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            await handler(content);
            this.channel.ack(msg); // Acknowledge message if successful
            logger.info(`[EVENTBUS] Processed event from ${queueName}: ${routingKey}`);
          } catch (err) {
            logger.error({ err }, `[EVENTBUS] Handler failed for ${routingKey}`);
            this.channel.nack(msg, false, false); // Do not requeue, send to Dead Letter (if configured) or drop
          }
        }
      });
      logger.info(`[EVENTBUS] Subscribed queue ${queueName} to ${routingKey}`);
    } catch (error) {
      logger.error({ error }, `[EVENTBUS] Failed to subscribe to ${routingKey}`);
    }
  }
}

export default new EventBus();
