import prisma from '../../../config/prisma.js';
import redisClient from '../../../config/redis.js';
import { healthCheck as razorpayHealth } from '../../../config/razorpay.js';
import { isConfigured, getValidationErrors } from '../../../config/payment.config.js';

class PaymentHealthService {
  async checkAll() {
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {},
    };

    results.checks.configuration = this._checkConfiguration();

    try {
      results.checks.database = await this._checkDatabase();
    } catch (error) {
      results.checks.database = { status: 'unhealthy', error: error.message };
    }

    try {
      results.checks.redis = await this._checkRedis();
    } catch (error) {
      results.checks.redis = { status: 'unhealthy', error: error.message };
    }

    try {
      results.checks.razorpay = await this._checkRazorpay();
    } catch (error) {
      results.checks.razorpay = { status: 'unhealthy', error: error.message };
    }

    const allHealthy = Object.values(results.checks).every((c) => c.status === 'healthy');
    results.status = allHealthy ? 'healthy' : 'degraded';

    return results;
  }

  _checkConfiguration() {
    const valid = isConfigured();
    return {
      status: valid ? 'healthy' : 'unhealthy',
      validated: valid,
      errors: getValidationErrors(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  async _checkDatabase() {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'healthy' };
  }

  async _checkRedis() {
    const pong = await redisClient.ping();
    return { status: pong === 'PONG' ? 'healthy' : 'unhealthy' };
  }

  async _checkRazorpay() {
    const health = await razorpayHealth();
    return {
      status: health.status === 'healthy' ? 'healthy' : 'unhealthy',
      mode: health.mode,
      authStatus: health.status,
    };
  }
}

export default new PaymentHealthService();
