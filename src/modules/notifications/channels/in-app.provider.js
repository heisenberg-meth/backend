import { registerProvider } from './channel.provider.js';

registerProvider({
  channelType: 'IN_APP',
  providerName: 'internal',
  async send(notification) {
    return { success: true, providerMessageId: notification.id };
  },
});
