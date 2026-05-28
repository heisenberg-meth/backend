import logger from '../../../shared/utils/logger.js';
import * as emailService from '../../../shared/services/email.service.js';
import deliveryTrackingService from '../services/delivery-tracking.service.js';

export const processEmail = async (data) => {
  const { notificationId, recipient, subject, message } = data;
  logger.info(`[Email Worker] Processing job for notification ${notificationId}`);

  try {
    await deliveryTrackingService.markProcessing(notificationId);
    const result = await emailService.sendEmail(recipient, subject, message);
    await deliveryTrackingService.markSent(notificationId, 'email-provider', result?.messageId);
    await deliveryTrackingService.markDelivered(notificationId, 'email-provider');
  } catch (error) {
    logger.error(`[Email Worker] Failed: ${error.message}`);
    await deliveryTrackingService.markFailed(notificationId, error.message, 'email-provider');
    throw error;
  }
};
