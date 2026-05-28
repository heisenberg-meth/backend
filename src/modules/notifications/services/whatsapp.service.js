import logger from '../../../shared/utils/logger.js';

class WhatsappService {
  async send(recipient, templateName, variables) {
    logger.info(`[WHATSAPP MOCK] Sending WhatsApp to ${recipient}`);
    logger.info(`[WHATSAPP MOCK] Template: ${templateName}, Variables: ${JSON.stringify(variables)}`);
    
    await new Promise((resolve) => setTimeout(resolve, 600));

    return { success: true, messageId: `mock-wa-${Date.now()}` };
  }
}

export default new WhatsappService();
