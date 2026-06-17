/**
 * channel.provider.js
 *
 * Unified interface every channel provider implements. Backed by
 * NotificationChannelConfig (providerName, providerConfig JSON, priority,
 * isActive, rateLimitPerMinute) so providers can be swapped per tenant
 * without code changes.
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} success
 * @property {string} [providerMessageId]
 * @property {string} [errorMessage]
 */

/**
 * Each provider module must export an object matching this shape:
 *   { channelType: 'SMS', providerName: 'twilio', send: async (notification, config) => SendResult }
 */
export const providerRegistry = new Map();

export function registerProvider(provider) {
  const key = `${provider.channelType}:${provider.providerName}`;
  providerRegistry.set(key, provider);
}

export function getProvider(channelType, providerName) {
  const provider = providerRegistry.get(`${channelType}:${providerName}`);
  if (!provider) {
    throw new Error(`No provider registered for ${channelType}:${providerName}`);
  }
  return provider;
}
