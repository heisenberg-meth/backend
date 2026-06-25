import { describe, it, expect, vi, beforeEach } from 'vitest';
import authMetricsService from '../service/auth.metrics.service.js';
import { validateAuthConfigOnStartup } from '../service/auth.bootstrap.js';
import env from '../../../config/env.js';

vi.mock('../../../config/prisma.js', () => ({
  default: {
    $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  },
}));

vi.mock('../../../config/redis.js', () => ({
  default: {
    ping: vi.fn().mockResolvedValue('PONG'),
  },
}));

describe('Authentication Audit, Validation & Monitoring Framework', () => {
  beforeEach(() => {
    // Reset metrics before each test
    authMetricsService.metrics = {
      login: { success: 0, failure: 0, invalidPassword: 0, lockedAccount: 0 },
      refresh: { success: 0, failure: 0, replayAttack: 0, expiredToken: 0 },
      logout: { success: 0, failure: 0 },
      sessions: { activeSessions: 0, revokedSessions: 0, expiredSessions: 0 },
      cookies: { issued: 0, cleared: 0, rejected: 0, invalid: 0 },
    };
  });

  describe('Auth Metrics Service', () => {
    it('should correctly increment login success metrics', () => {
      authMetricsService.recordLoginSuccess();
      const metrics = authMetricsService.getMetrics();
      expect(metrics.raw.login.success).toBe(1);
      expect(metrics.dashboard.authentication.loginSuccessRate).toBe('100.00%');
    });

    it('should correctly increment login failure metrics for invalid password', () => {
      authMetricsService.recordLoginFailure('invalid_password');
      const metrics = authMetricsService.getMetrics();
      expect(metrics.raw.login.failure).toBe(1);
      expect(metrics.raw.login.invalidPassword).toBe(1);
      expect(metrics.dashboard.authentication.loginSuccessRate).toBe('0.00%');
    });

    it('should correctly increment refresh failure and detect replay attacks', () => {
      authMetricsService.recordRefreshFailure('replay');
      const metrics = authMetricsService.getMetrics();
      expect(metrics.raw.refresh.failure).toBe(1);
      expect(metrics.raw.refresh.replayAttack).toBe(1);
      expect(metrics.dashboard.authentication.refreshSuccessRate).toBe('0.00%');
    });

    it('should increment cookie validation metrics', () => {
      authMetricsService.recordCookieRejected();
      authMetricsService.recordCookieInvalid();
      const metrics = authMetricsService.getMetrics();
      expect(metrics.raw.cookies.rejected).toBe(1);
      expect(metrics.raw.cookies.invalid).toBe(1);
      expect(metrics.dashboard.authentication.cookieErrors).toBe(2);
    });
  });

  describe('Startup Configuration Validation', () => {
    it('should pass validation when environment is correctly configured', async () => {
      env.nodeEnv = 'production';
      env.frontendUrl = 'https://medassist.viyaninfo.com';
      env.cookieSecret = 'test-secret';
      env.jwtSecrets = ['super-secure-long-secret-key-that-is-at-least-64-characters-long'];
      env.redis = { url: 'redis://localhost:6379' };
      env.cookieDomain = '.viyaninfo.com';

      await expect(validateAuthConfigOnStartup()).resolves.toBeUndefined();
    });

    it('should throw error if cookie domain is localhost in production', async () => {
      env.nodeEnv = 'production';
      env.cookieDomain = 'localhost';

      await expect(validateAuthConfigOnStartup()).rejects.toThrow(/Cookie Configuration Invalid/);
    });

    it('should throw error if required secrets are missing', async () => {
      env.nodeEnv = 'production';
      env.cookieDomain = '.viyaninfo.com';
      env.jwtSecrets = []; // Missing JWT secret

      await expect(validateAuthConfigOnStartup()).rejects.toThrow(/JWT_SECRET missing/);
    });
  });
});
