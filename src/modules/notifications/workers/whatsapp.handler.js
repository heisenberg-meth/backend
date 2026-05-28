import logger from '../../../shared/utils/logger.js';
import whatsappService from '../services/whatsapp.service.js';
import deliveryTrackingService from '../services/delivery-tracking.service.js';

export const processWhatsapp = async (data) => {
  const { notificationId, recipient, templateName, variables } = data;
  logger.info(`[WhatsApp Worker] Processing job for notification ${notificationId}`);

  try {
    await deliveryTrackingService.markProcessing(notificationId);
    const result = await whatsappService.send(recipient, templateName, variables);
    await deliveryTrackingService.markSent(notificationId, 'whatsapp-provider', result?.messageId);
    await deliveryTrackingService.markDelivered(notificationId, 'whatsapp-provider');
  } catch (error) {
    logger.error(`[WhatsApp Worker] Failed: ${error.message}`);
    await deliveryTrackingService.markFailed(notificationId, error.message, 'whatsapp-provider');
    throw error;
  }
};
