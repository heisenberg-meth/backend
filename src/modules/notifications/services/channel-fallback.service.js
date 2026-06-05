import notificationService from './notification.service.js';
import deliveryTrackingService from './delivery-tracking.service.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import logger from '../../../shared/utils/logger.js';

const FALLBACK_CHAIN = {
  WHATSAPP: ['SMS', 'EMAIL'],
  SMS: ['EMAIL'],
  EMAIL: [],
};

class ChannelFallbackService {
  async executeFallback(notificationId, failedChannel, params) {
    const fallbacks = FALLBACK_CHAIN[failedChannel] || [];
    if (fallbacks.length === 0)
      return { fallbackUsed: false, message: 'No fallback channels configured' };

    await deliveryTrackingService.markRetrying(notificationId);
    logger.info(
      `[Fallback] ${failedChannel} failed for ${params.recipient}, trying ${fallbacks.join(' → ')}`,
    );

    for (const fallbackChannel of fallbacks) {
      try {
        const result = await notificationService.queueNotification({
          ...params,
          channel: fallbackChannel,
          notificationType: params.notificationType || 'FALLBACK',
        });

        if (result.success) {
          emitLocalEvent(DOMAIN_EVENTS.CHANNEL_FALLBACK, {
            originalNotificationId: notificationId,
            originalChannel: failedChannel,
            fallbackChannel,
            recipient: params.recipient,
            newNotificationId: result.notificationId,
          });

          return {
            fallbackUsed: true,
            fallbackChannel,
            newNotificationId: result.notificationId,
          };
        }
      } catch (error) {
        logger.error(
          `[Fallback] ${fallbackChannel} also failed for ${params.recipient}: ${error.message}`,
        );
      }
    }

    return { fallbackUsed: false, message: 'All fallback channels exhausted' };
  }

  getFallbackChannels(channel) {
    return FALLBACK_CHAIN[channel] || [];
  }
}

export default new ChannelFallbackService();
