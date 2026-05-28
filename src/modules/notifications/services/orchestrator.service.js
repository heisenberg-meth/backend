import notificationService from './notification.service.js';
import deduplicationService from './deduplication.service.js';
import rateLimitService from './rate-limit.service.js';
import throttlingService from './throttling.service.js';
import patientPreferenceService from './patient-preference.service.js';
import channelFallbackService from './channel-fallback.service.js';
import logger from '../../../shared/utils/logger.js';

class NotificationOrchestratorService {
  async send(params) {
    const { tenantId, channel, recipient, templateName, variables, patientId, notificationType, userId } = params;

    // 1. Check patient communication consent
    if (patientId) {
      const consent = await patientPreferenceService.checkPatientConsent(patientId, channel);
      if (!consent.allowed) {
        logger.info(`[Orchestrator] Skipped ${channel} for patient ${patientId}: ${consent.reason}`);
        return { success: false, reason: consent.reason, skipped: true };
      }
    }

    // 2. Check duplicates
    const isDuplicate = await deduplicationService.checkDuplicate(tenantId, channel, recipient, templateName, notificationType);
    if (isDuplicate) {
      logger.info(`[Orchestrator] Skipped duplicate ${channel} for ${recipient}`);
      return { success: false, reason: 'DUPLICATE', skipped: true };
    }

    // 3. Check rate limit (per recipient)
    const rateLimit = await rateLimitService.checkRateLimit(tenantId, channel.toLowerCase(), recipient);
    if (!rateLimit.allowed) {
      return { success: false, reason: 'RATE_LIMITED', retryAfter: rateLimit.retryAfter };
    }

    // 4. Check hourly throttle (per tenant per channel)
    const throttle = await throttlingService.checkHourlyThrottle(tenantId, channel);
    if (!throttle.allowed) {
      return { success: false, reason: 'THROTTLED', retryAfter: throttle.retryAfter };
    }

    // 5. Queue the notification
    const result = await notificationService.queueNotification({
      tenantId,
      userId,
      patientId,
      notificationType,
      channel,
      recipient,
      templateName,
      variables,
    });

    if (result.success) {
      await deduplicationService.markSent(tenantId, channel, recipient, templateName, notificationType);
      return { success: true, notificationId: result.notificationId };
    }

    return { success: false, reason: 'QUEUE_FAILED' };
  }

  async sendWithFallback(params) {
    const { channel } = params;
    const result = await this.send(params);

    if (!result.success && result.reason === 'RATE_LIMITED') {
      return result;
    }

    if (!result.success && !result.skipped) {
      const fallbackResult = await channelFallbackService.executeFallback(null, channel, params);
      return { ...result, fallback: fallbackResult };
    }

    return result;
  }
}

export default new NotificationOrchestratorService();
