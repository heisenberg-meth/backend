import prisma from '../../../config/prisma.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';

class DeliveryTrackingService {
  async recordEvent(notificationId, eventType, options = {}) {
    const { providerName, providerMessageId, errorMessage } = options;

    const event = await prisma.notificationDeliveryEvent.create({
      data: {
        notificationId,
        eventType,
        providerName,
        providerMessageId,
        errorMessage,
      },
    });

    if (eventType === 'SENT' || eventType === 'DELIVERED') {
      await this._updateNotificationStatus(notificationId, eventType);
    } else if (eventType === 'FAILED') {
      await this._updateNotificationStatus(notificationId, eventType);
    }

    emitLocalEvent(`NOTIFICATION_${eventType}`, {
      notificationId,
      eventType,
      providerName,
      timestamp: new Date().toISOString(),
    });

    return event;
  }

  async markQueued(notificationId) {
    return this.recordEvent(notificationId, 'QUEUED');
  }

  async markProcessing(notificationId) {
    return this.recordEvent(notificationId, 'PROCESSING');
  }

  async markSent(notificationId, providerName, providerMessageId) {
    return this.recordEvent(notificationId, 'SENT', { providerName, providerMessageId });
  }

  async markDelivered(notificationId, providerName) {
    return this.recordEvent(notificationId, 'DELIVERED', { providerName });
  }

  async markFailed(notificationId, errorMessage, providerName) {
    return this.recordEvent(notificationId, 'FAILED', { errorMessage, providerName });
  }

  async markRetrying(notificationId) {
    return this.recordEvent(notificationId, 'RETRYING');
  }

  async markBounced(notificationId, errorMessage) {
    return this.recordEvent(notificationId, 'BOUNCED', { errorMessage });
  }

  async markOpened(notificationId) {
    return this.recordEvent(notificationId, 'OPENED');
  }

  async getDeliveryHistory(notificationId) {
    return prisma.notificationDeliveryEvent.findMany({
      where: { notificationId },
      orderBy: { eventTimestamp: 'asc' },
    });
  }

  async _updateNotificationStatus(notificationId, eventType) {
    const data = {};

    switch (eventType) {
      case 'QUEUED':
        data.deliveryStatus = 'QUEUED';
        break;
      case 'PROCESSING':
        data.deliveryStatus = 'PROCESSING';
        break;
      case 'SENT':
        data.deliveryStatus = 'SENT';
        data.sentAt = new Date();
        break;
      case 'DELIVERED':
        data.deliveryStatus = 'DELIVERED';
        break;
      case 'FAILED':
        data.deliveryStatus = 'FAILED';
        break;
      case 'RETRYING':
        data.deliveryStatus = 'RETRYING';
        break;
    }

    if (Object.keys(data).length > 0) {
      await prisma.notification.update({
        where: { id: notificationId },
        data,
      });
    }
  }
}

export default new DeliveryTrackingService();
