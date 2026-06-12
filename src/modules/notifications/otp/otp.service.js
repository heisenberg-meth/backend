import crypto from 'crypto';
import redisClient from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import deliveryTrackingService from '../services/delivery-tracking.service.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import otpAuditService from '../../../shared/services/otp-audit.service.js';

const OTP_TTL_SECONDS = 600;
const MAX_VERIFY_ATTEMPTS = 5;

class OtpService {
  async generateOtp(tenantId, recipient, channel = 'SMS') {
    const otp = crypto.randomInt(100000, 999999).toString();
    const key = `otp:${tenantId}:${channel}:${recipient}`;
    const attemptsKey = `otp:attempts:${tenantId}:${channel}:${recipient}`;

    await redisClient.set(key, otp, 'EX', OTP_TTL_SECONDS);
    await redisClient.del(attemptsKey);

    logger.info(`[OTP] Generated OTP for ${recipient} via ${channel}`);

    otpAuditService.logOtpGenerated({
      email: recipient,
      otp,
      purpose: 'VERIFICATION',
      channel,
    });

    return { otp, ttl: OTP_TTL_SECONDS };
  }

  async verifyOtp(tenantId, recipient, otp, channel = 'SMS') {
    const key = `otp:${tenantId}:${channel}:${recipient}`;
    const attemptsKey = `otp:attempts:${tenantId}:${channel}:${recipient}`;

    const attempts = parseInt((await redisClient.get(attemptsKey)) || '0', 10);
    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      await redisClient.del(key);
      emitLocalEvent(DOMAIN_EVENTS.NOTIFICATION_FAILED, {
        tenantId,
        recipient,
        reason: 'OTP_MAX_ATTEMPTS',
      });
      otpAuditService.logOtpFailed({
        email: recipient,
        reason: 'MAX_ATTEMPTS',
        attempt: attempts,
        purpose: 'VERIFICATION',
        channel,
      });
      return { verified: false, reason: 'MAX_ATTEMPTS_EXCEEDED' };
    }

    await redisClient.incr(attemptsKey);
    await redisClient.expire(attemptsKey, OTP_TTL_SECONDS);

    const storedOtp = await redisClient.get(key);
    if (!storedOtp) {
      otpAuditService.logOtpExpired({
        email: recipient,
        purpose: 'VERIFICATION',
        channel,
      });
      return { verified: false, reason: 'OTP_EXPIRED' };
    }

    if (storedOtp !== otp) {
      otpAuditService.logOtpFailed({
        email: recipient,
        enteredOtp: otp,
        reason: 'INVALID_OTP',
        attempt: attempts + 1,
        purpose: 'VERIFICATION',
        channel,
      });
      return {
        verified: false,
        reason: 'INVALID_OTP',
        remainingAttempts: MAX_VERIFY_ATTEMPTS - attempts - 1,
      };
    }

    await redisClient.del(key);
    await redisClient.del(attemptsKey);

    otpAuditService.logOtpVerified({
      email: recipient,
      otp,
      channel,
    });

    emitLocalEvent(DOMAIN_EVENTS.OTP_VERIFIED, { tenantId, recipient, channel });
    return { verified: true };
  }

  async sendOtp(tenantId, recipient, channel = 'SMS') {
    const { otp, ttl } = await this.generateOtp(tenantId, recipient, channel);
    await deliveryTrackingService.recordEvent(null, 'OTP_SENT', {
      providerName: channel.toLowerCase(),
      errorMessage: null,
    });
    emitLocalEvent(DOMAIN_EVENTS.OTP_SENT, { tenantId, recipient, channel, ttl });
    return { otp, ttl };
  }
}

export default new OtpService();
