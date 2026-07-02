import prisma from '../../../config/prisma.js';
import redis from '../../../config/redis.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

class SecurityEngineService {
  /**
   * Evaluates runtime login velocity, IP reputation, and impossible travel patterns.
   */
  async evaluateLoginRisk({ userId, email, ipAddress, headers = {} }) {
    if (!ipAddress) return { riskScore: 0, status: 'SAFE' };

    // 1. Check IP Blacklist
    const isIpBlocked = await redis.get(`auth:threat:ip:${ipAddress}`).catch(() => null);
    if (isIpBlocked) {
      logger.warn({ ipAddress, email }, 'Login blocked: Suspicious IP Blacklist hit');
      const err = new Error('Access blocked from this IP due to detected malicious activity.');
      err.code = AUTH_ERRORS.AUTH_IP_BLOCKED;
      throw err;
    }

    // 2. Check Cloud Edge Threat Score Headers
    const threatScore = parseInt(headers['x-threat-score'] || '0', 10);
    const isBot = headers['cf-bot-management'] === 'true';

    if (threatScore > 80 || isBot) {
      logger.warn({ ipAddress, threatScore, isBot }, 'Login blocked: High edge threat score');
      const err = new Error('Automated or high-risk request identified.');
      err.code = AUTH_ERRORS.AUTH_RISK_BLOCKED;
      throw err;
    }

    // 3. Impossible Travel Check (Velocity Analysis)
    if (userId) {
      const lastLogin = await prisma.loginHistory.findFirst({
        where: { userId, status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });

      const currentCountry = headers['cf-ipcountry'] || headers['x-country'] || 'Unknown';

      if (
        lastLogin &&
        lastLogin.country &&
        lastLogin.country !== 'Unknown' &&
        currentCountry !== 'Unknown' &&
        lastLogin.country !== currentCountry
      ) {
        const hoursDiff = (Date.now() - lastLogin.createdAt.getTime()) / (1000 * 60 * 60);

        if (hoursDiff < 2) {
          logger.warn(
            { userId, lastCountry: lastLogin.country, currentCountry, hoursDiff },
            'High Risk: Impossible travel velocity detected',
          );

          eventBus.publish('ImpossibleTravelDetected', {
            userId,
            email,
            ipAddress,
            previousCountry: lastLogin.country,
            currentCountry,
            hoursDiff,
            timestamp: new Date(),
          });

          // Step-up verification required
          const err = new Error(
            'Unusual login location detected. Multi-factor step-up verification required.',
          );
          err.code = AUTH_ERRORS.AUTH_STEP_UP_REQUIRED;
          throw err;
        }
      }
    }

    return { riskScore: threatScore, status: 'SAFE' };
  }

  /**
   * Enforces brute force account lockout and IP throttling.
   */
  async checkBruteForce(userId, ipAddress) {
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { lockedUntil: true },
      });

      if (user?.lockedUntil && user.lockedUntil > new Date()) {
        const remainingSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
        const err = new Error(
          'Account locked due to too many failed attempts. Please try again later.',
        );
        err.code = 'ACCOUNT_TEMPORARILY_LOCKED';
        err.retryAfter = remainingSeconds;
        throw err;
      }
    }

    if (ipAddress) {
      const ipAttempts = await redis.get(`auth:attempts:ip:${ipAddress}`).catch(() => 0);
      if (parseInt(ipAttempts, 10) > 25) {
        // Quarantine IP for 1 hour
        await redis.setex(`auth:threat:ip:${ipAddress}`, 3600, 'THROTTLED').catch(() => {});
        const err = new Error('Too many failed requests from this network.');
        err.code = AUTH_ERRORS.AUTH_IP_BLOCKED;
        throw err;
      }
    }
  }

  /**
   * Records a failed authentication attempt and increments progressive throttling counters.
   */
  async recordFailedLogin({ userId, email, ipAddress }) {
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { failedLoginAttempts: true },
      });

      if (user) {
        const newAttempts = user.failedLoginAttempts + 1;
        const updates = {
          failedLoginAttempts: newAttempts,
          lastFailedLogin: new Date(),
        };

        if (newAttempts >= 5) {
          updates.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
          logger.warn({ userId, email }, 'Brute Force Defense: Account locked for 15 minutes');
          eventBus.publish('AccountLocked', { userId, email, ipAddress, timestamp: new Date() });
        }

        await prisma.user.update({
          where: { id: userId },
          data: updates,
        });
      }
    }

    if (ipAddress) {
      const ipAttemptsKey = `auth:attempts:ip:${ipAddress}`;
      const ipCount = await redis.incr(ipAttemptsKey).catch(() => 1);
      if (ipCount === 1) await redis.expire(ipAttemptsKey, 600).catch(() => {});
    }
  }

  /**
   * Clears failure counters upon successful verification.
   */
  async clearFailedLogin({ userId }) {
    if (!userId) return;
    await prisma.user
      .update({
        where: { id: userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastSuccessfulLogin: new Date(),
        },
      })
      .catch(() => {});
  }
}

export default new SecurityEngineService();
