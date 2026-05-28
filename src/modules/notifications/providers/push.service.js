import logger from '../../../shared/utils/logger.js';

class PushNotificationService {
  async send(recipient, title, body = {}) {
    logger.info(`[PUSH MOCK] Sending push notification to ${recipient}`);
    logger.info(`[PUSH MOCK] Title: ${title}, Body: ${body}`);

    await new Promise((resolve) => setTimeout(resolve, 300));

    return { success: true, messageId: `mock-push-${Date.now()}` };
  }

  async sendToDevice(deviceToken, notification, data = {}) {
    return this.send(deviceToken, notification.title, notification.body, data);
  }

  async sendToTopic(topic, notification, data = {}) {
    return this.send(`topic:${topic}`, notification.title, notification.body, data);
  }
}

export default new PushNotificationService();
