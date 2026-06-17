import twilio from 'twilio';
import { registerProvider } from './channel.provider.js';

registerProvider({
  channelType: 'SMS',
  providerName: 'twilio',
  async send(notification, providerConfig) {
    try {
      const client = twilio(providerConfig.accountSid, providerConfig.authToken);

      const result = await client.messages.create({
        body: notification.message,
        from: providerConfig.fromNumber,
        to: notification.recipient,
      });

      return { success: true, providerMessageId: result.sid };
    } catch (err) {
      return { success: false, errorMessage: err.message };
    }
  },
});
