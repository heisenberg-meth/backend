import smsRepository from '../repositories/sms.repository.js';
import { mainQueue } from '../../../queue/index.js';

class NotificationService {
  /**
   * Queue an SMS notification
   */
  async sendSms(tenantId, data) {
    const { patientId, phone, message, type } = data;

    // 1. Record in DB
    const notification = await smsRepository.createNotification({
      tenantId,
      patientId,
      phone,
      message,
      type,
      status: 'PENDING',
    });

    // 2. Add to Queue
    await mainQueue.add('send-sms', {
      notificationId: notification.id,
      phone,
      message,
    });

    return notification;
  }

  /**
   * Queue a WhatsApp notification
   */
  async sendWhatsApp(tenantId, data) {
    const { patientId, phone, message, type, mediaUrl } = data;

    // Record as SMS for now or create a dedicated whatsapp repository
    const notification = await smsRepository.createNotification({
      tenantId,
      patientId,
      phone,
      message,
      type: `WA_${type}`,
      status: 'PENDING',
    });

    await mainQueue.add('send-whatsapp', {
      notificationId: notification.id,
      phone,
      message,
      mediaUrl,
    });

    return notification;
  }

  /**
   * Queue an Email notification
   */
  async sendEmail(tenantId, data) {
    const { patientId, email, subject, message, html, type, attachments } = data;

    // Use a queue to process email
    await mainQueue.add('send-email', {
      tenantId,
      patientId,
      email,
      subject,
      message,
      html,
      type,
      attachments,
    });

    return { success: true, message: 'Email queued' };
  }

  async getHistory(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return smsRepository.findHistory(tenantId, skip, limit);
  }
}

export default new NotificationService();
