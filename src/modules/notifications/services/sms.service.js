import logger from '../../../shared/utils/logger.js';

class SmsService {
  async send(recipient, message) {
    logger.info(`[SMS MOCK] Sending SMS to ${recipient}`);
    logger.info(`[SMS MOCK] Message: ${message}`);
    
    await new Promise((resolve) => setTimeout(resolve, 500));

    return { success: true, messageId: `mock-sms-${Date.now()}` };
  }
}

export default new SmsService();
