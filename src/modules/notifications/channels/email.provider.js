import nodemailer from 'nodemailer';
import { registerProvider } from './channel.provider.js';

registerProvider({
  channelType: 'EMAIL',
  providerName: 'smtp',
  async send(notification, providerConfig) {
    try {
      const transporter = nodemailer.createTransport({
        host: providerConfig.host,
        port: providerConfig.port,
        secure: providerConfig.secure ?? false,
        auth: providerConfig.auth,
      });

      const info = await transporter.sendMail({
        from: providerConfig.fromAddress,
        to: notification.recipient,
        subject: notification.subject || 'Notification',
        text: notification.message,
      });

      return { success: true, providerMessageId: info.messageId };
    } catch (err) {
      return { success: false, errorMessage: err.message };
    }
  },
});
