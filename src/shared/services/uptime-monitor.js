/**
 * Uptime Monitoring Service
 * Monitors health of all services and sends alerts
 */

import prisma from '../config/prisma.js';
import cache from './cache.service.js';
import logger from '../../shared/utils/logger.js';

const HEALTH_CHECK_INTERVAL = 60000; // 1 minute
const ALERT_COOLDOWN = 300000; // 5 minutes between alerts

class UptimeMonitor {
  constructor() {
    this.services = new Map();
    this.alertCooldowns = new Map();
    this.isRunning = false;
  }

  /**
   * Register a service to monitor
   */
  registerService(name, healthCheckFn, options = {}) {
    this.services.set(name, {
      name,
      healthCheck: healthCheckFn,
      interval: options.interval || HEALTH_CHECK_INTERVAL,
      timeout: options.timeout || 10000,
      critical: options.critical !== false,
      lastCheck: null,
      lastStatus: null,
      lastError: null,
      consecutiveFailures: 0,
    });
  }

  /**
   * Check health of a single service
   */
  async checkService(name) {
    const service = this.services.get(name);
    if (!service) return null;

    const startTime = Date.now();
    let status = 'healthy';
    let error = null;

    try {
      await Promise.race([
        service.healthCheck(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), service.timeout)
        ),
      ]);
    } catch (err) {
      status = 'unhealthy';
      error = err.message;
      service.consecutiveFailures++;
    }

    const duration = Date.now() - startTime;

    if (status === 'healthy') {
      service.consecutiveFailures = 0;
    }

    service.lastCheck = new Date();
    service.lastStatus = status;
    service.lastError = error;

    const result = {
      service: name,
      status,
      duration,
      error,
      consecutiveFailures: service.consecutiveFailures,
      timestamp: new Date(),
    };

    // Cache the health status
    await cache.set(`health:${name}`, result, 120);

    // Log health check
    if (status === 'unhealthy') {
      logger.warn({ ...result }, `Health check failed: ${name}`);
    } else {
      logger.debug({ service: name, duration }, 'Health check passed');
    }

    // Check if we need to send an alert
    if (status === 'unhealthy' && service.critical && service.consecutiveFailures >= 3) {
      await this.sendAlert(name, result);
    }

    return result;
  }

  /**
   * Check all services
   */
  async checkAll() {
    const results = await Promise.allSettled(
      Array.from(this.services.keys()).map((name) => this.checkService(name))
    );

    const summary = results.map((r) => r.value || { status: 'error', error: r.reason?.message });

    await cache.set('health:summary', summary, 60);

    return summary;
  }

  /**
   * Send alert for service failure
   */
  async sendAlert(serviceName, healthResult) {
    const cooldownKey = `alert:${serviceName}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);

    if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN) {
      return; // Still in cooldown
    }

    this.alertCooldowns.set(cooldownKey, Date.now());

    logger.error({
      service: serviceName,
      status: healthResult.status,
      error: healthResult.error,
      consecutiveFailures: healthResult.consecutiveFailures,
    }, `ALERT: Service ${serviceName} is unhealthy!`);

    // Store alert in database
    try {
      await prisma.auditLog.create({
        data: {
          tenantId: 'SYSTEM',
          action: 'HEALTH_ALERT',
          target: serviceName,
          type: 'SYSTEM',
        },
      });
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to store health alert');
    }
  }

  /**
   * Get health status for all services
   */
  async getHealthStatus() {
    const cached = await cache.get('health:summary');
    if (cached) return cached;

    return this.checkAll();
  }

  /**
   * Get health status for a specific service
   */
  async getServiceHealth(serviceName) {
    const cached = await cache.get(`health:${serviceName}`);
    if (cached) return cached;

    return this.checkService(serviceName);
  }

  /**
   * Start periodic health checks
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('Uptime monitor started');

    // Run initial check
    this.checkAll();

    // Set up periodic checks
    this.intervalId = setInterval(() => {
      this.checkAll().catch((err) => {
        logger.error({ err: err.message }, 'Health check cycle failed');
      });
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop periodic health checks
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info('Uptime monitor stopped');
  }
}

// Create singleton instance
const uptimeMonitor = new UptimeMonitor();

// Register built-in services
uptimeMonitor.registerService('database', async () => {
  await prisma.$queryRaw`SELECT 1`;
}, { critical: true });

uptimeMonitor.registerService('redis', async () => {
  const redis = await import('../../config/redis.js');
  const client = redis.default;
  if (client && typeof client.ping === 'function') {
    await client.ping();
  }
}, { critical: true });

export default uptimeMonitor;
