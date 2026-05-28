import logger from '../../../shared/utils/logger.js';
import smsService from '../services/sms.service.js';
import deliveryTrackingService from '../services/delivery-tracking.service.js';

export const processSms = async (data) => {
  const { notificationId, recipient, message } = data;
  logger.info(`[SMS Worker] Processing job for notification ${notificationId}`);

  try {
    await deliveryTrackingService.markProcessing(notificationId);
    const result = await smsService.send(recipient, message);
    await deliveryTrackingService.markSent(notificationId, 'sms-provider', result?.messageId);
    await deliveryTrackingService.markDelivered(notificationId, 'sms-provider');
  } catch (error) {
    logger.error(`[SMS Worker] Failed: ${error.message}`);
    await deliveryTrackingService.markFailed(notificationId, error.message, 'sms-provider');
    throw error;
  }
};
