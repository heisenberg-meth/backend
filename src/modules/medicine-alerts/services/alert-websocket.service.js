import { getIO } from '../../../config/socket.js';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';

const ALERT_CHANNEL = 'medicine-alerts';

class AlertWebSocketBroadcaster {
  init() {
    this._setupRedisSubscriber();
    logger.info('[ALERT-WS] WebSocket alert broadcaster initialized');
  }

  async broadcastAlert(tenantId, branchId, eventType, payload) {
    const message = {
      eventType,
      tenantId,
      branchId,
      payload,
      timestamp: new Date().toISOString(),
    };

    try {
      await redisClient.publish(ALERT_CHANNEL, JSON.stringify(message));
    } catch (error) {
      logger.error({ error }, '[ALERT-WS] Failed to publish alert via Redis');
    }

    this._emitToSocket(tenantId, branchId, eventType, payload);
  }

  async broadcastBatch(tenantId, alerts) {
    for (const alert of alerts) {
      await this.broadcastAlert(tenantId, alert.branchId, alert.eventType, alert.payload);
    }
  }

  _setupRedisSubscriber() {
    const subscriber = redisClient.duplicate();

    subscriber.subscribe(ALERT_CHANNEL, (err) => {
      if (err) {
        logger.error({ err }, '[ALERT-WS] Failed to subscribe to Redis channel');
        return;
      }
      logger.info('[ALERT-WS] Subscribed to Redis alert channel');
    });

    subscriber.on('message', (channel, message) => {
      if (channel !== ALERT_CHANNEL) return;

      try {
        const data = JSON.parse(message);
        this._emitToSocket(data.tenantId, data.branchId, data.eventType, data.payload);
      } catch (error) {
        logger.error({ error }, '[ALERT-WS] Failed to process Redis message');
      }
    });
  }

  _emitToSocket(tenantId, branchId, eventType, payload) {
    try {
      const io = getIO();
      if (!io) return;

      if (branchId) {
        io.to(`branch:${branchId}`).emit(eventType, payload);
      }

      io.to(`tenant:${tenantId}`).emit(eventType, payload);
    } catch (error) {
      logger.error({ error }, '[ALERT-WS] Failed to emit to Socket.IO');
    }
  }
}

export default new AlertWebSocketBroadcaster();
