import prisma from '../../../config/prisma.js';
import notificationService from '../services/notification.service.js';
import queueService from '../queues/queue.service.js';
import orchestratorService from '../services/orchestrator.service.js';
import deliveryTrackingService from '../services/delivery-tracking.service.js';
import notificationAnalyticsService from '../services/analytics.service.js';
import channelFallbackService from '../services/channel-fallback.service.js';
import patientPreferenceService from '../services/patient-preference.service.js';
import throttlingService from '../services/throttling.service.js';
import deduplicationService from '../services/deduplication.service.js';
import rateLimitService from '../services/rate-limit.service.js';
import otpService from '../otp/otp.service.js';
import pushService from '../providers/push.service.js';
import providerRegistry from '../providers/provider-registry.js';
import templateService from '../services/template.service.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';

class NotificationFastifyController {
  async unifiedSend(request, reply) {
    try {
      const { tenantId, id: userId } = request.user;
      const { channel, recipient, template, variables, patientId, notificationType } = request.body;

      const result = await orchestratorService.send({
        tenantId,
        userId,
        patientId,
        channel: channel.toUpperCase(),
        recipient,
        templateName: template,
        variables,
        notificationType,
      });

      const status = result.success ? 202 : result.reason === 'RATE_LIMITED' ? 429 : 200;
      return reply.code(status).send({ success: result.success, data: result });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Unified send failed');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async sendEmail(request, reply) {
    try {
      const { tenantId, id: userId } = request.user;
      const { to, subject, template, data, notificationType } = request.body;

      if (!to || !Array.isArray(to) || to.length === 0) {
        return reply.code(400).send({ success: false, message: 'Recipient email(s) required' });
      }

      if (!template && !subject) {
        return reply.code(400).send({ success: false, message: 'Template or subject required' });
      }

      const results = [];

      for (const recipient of to) {
        const isDuplicate = await deduplicationService.checkDuplicate(
          tenantId,
          'EMAIL',
          recipient,
          template,
          notificationType,
        );
        if (isDuplicate) {
          results.push({ recipient, status: 'SKIPPED', reason: 'DUPLICATE' });
          continue;
        }

        const rateLimit = await rateLimitService.checkRateLimit(tenantId, 'email', recipient);
        if (!rateLimit.allowed) {
          results.push({
            recipient,
            status: 'RATE_LIMITED',
            reason: `Max ${rateLimit.max} per ${rateLimit.windowSeconds}s`,
          });
          continue;
        }

        const result = await notificationService.queueNotification({
          tenantId,
          userId,
          notificationType: notificationType || 'ALERT',
          channel: 'EMAIL',
          recipient,
          subject,
          templateName: template,
          variables: data,
        });

        if (result.success) {
          await deduplicationService.markSent(
            tenantId,
            'EMAIL',
            recipient,
            template,
            notificationType,
          );
          results.push({ recipient, status: 'QUEUED', notificationId: result.notificationId });
        } else {
          results.push({ recipient, status: 'FAILED', reason: result.reason });
        }
      }

      return reply.code(202).send({ success: true, data: results });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to queue email');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async sendSms(request, reply) {
    try {
      const { tenantId, id: userId } = request.user;
      const { phoneNumber, template, data, notificationType } = request.body;

      if (!phoneNumber) {
        return reply.code(400).send({ success: false, message: 'Phone number required' });
      }

      if (!template) {
        return reply.code(400).send({ success: false, message: 'Template required for SMS' });
      }

      const isDuplicate = await deduplicationService.checkDuplicate(
        tenantId,
        'SMS',
        phoneNumber,
        template,
        notificationType,
      );
      if (isDuplicate) {
        return reply.send({ success: true, data: { status: 'SKIPPED', reason: 'DUPLICATE' } });
      }

      const rateLimit = await rateLimitService.checkRateLimit(tenantId, 'sms', phoneNumber);
      if (!rateLimit.allowed) {
        return reply.code(429).send({
          success: false,
          message: 'SMS rate limit exceeded',
          retryAfter: rateLimit.retryAfter,
        });
      }

      const result = await notificationService.queueNotification({
        tenantId,
        userId,
        notificationType: notificationType || 'ALERT',
        channel: 'SMS',
        recipient: phoneNumber,
        templateName: template,
        variables: data,
      });

      if (result.success) {
        await deduplicationService.markSent(
          tenantId,
          'SMS',
          phoneNumber,
          template,
          notificationType,
        );
      }

      return reply.code(202).send({ success: true, data: result });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to queue SMS');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async sendWhatsApp(request, reply) {
    try {
      const { tenantId, id: userId } = request.user;
      const { phoneNumber, template, data, notificationType } = request.body;

      if (!phoneNumber) {
        return reply.code(400).send({ success: false, message: 'Phone number required' });
      }

      if (!template) {
        return reply.code(400).send({ success: false, message: 'Template required for WhatsApp' });
      }

      const isDuplicate = await deduplicationService.checkDuplicate(
        tenantId,
        'WHATSAPP',
        phoneNumber,
        template,
        notificationType,
      );
      if (isDuplicate) {
        return reply.send({ success: true, data: { status: 'SKIPPED', reason: 'DUPLICATE' } });
      }

      const rateLimit = await rateLimitService.checkRateLimit(tenantId, 'whatsapp', phoneNumber);
      if (!rateLimit.allowed) {
        return reply.code(429).send({
          success: false,
          message: 'WhatsApp rate limit exceeded',
          retryAfter: rateLimit.retryAfter,
        });
      }

      const result = await notificationService.queueNotification({
        tenantId,
        userId,
        notificationType: notificationType || 'ALERT',
        channel: 'WHATSAPP',
        recipient: phoneNumber,
        templateName: template,
        variables: data,
      });

      if (result.success) {
        await deduplicationService.markSent(
          tenantId,
          'WHATSAPP',
          phoneNumber,
          template,
          notificationType,
        );
      }

      return reply.code(202).send({ success: true, data: result });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to queue WhatsApp');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async sendPush(request, reply) {
    try {
      const { tenantId } = request.user;
      const { deviceToken, title, body, data } = request.body;

      if (!deviceToken) {
        return reply.code(400).send({ success: false, message: 'Device token required' });
      }

      const result = await providerRegistry.sendWithFailover(tenantId, 'PUSH', async () => {
        return pushService.sendToDevice(deviceToken, { title, body }, data);
      });

      return reply.code(202).send({ success: true, data: result });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to send push notification');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async sendOtp(request, reply) {
    try {
      const { tenantId } = request.user;
      const { recipient, channel = 'SMS' } = request.body;

      if (!recipient) {
        return reply.code(400).send({ success: false, message: 'Recipient required' });
      }

      const { ttl } = await otpService.sendOtp(tenantId, recipient, channel.toUpperCase());

      return reply.send({ success: true, data: { ttl, message: `OTP sent via ${channel}` } });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to send OTP');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async verifyOtp(request, reply) {
    try {
      const { tenantId } = request.user;
      const { recipient, otp, channel = 'SMS' } = request.body;

      if (!recipient || !otp) {
        return reply.code(400).send({ success: false, message: 'Recipient and OTP required' });
      }

      const result = await otpService.verifyOtp(tenantId, recipient, otp, channel.toUpperCase());

      if (!result.verified) {
        const status = result.reason === 'OTP_EXPIRED' ? 410 : 400;
        return reply.code(status).send({ success: false, message: result.reason, data: result });
      }

      return reply.send({ success: true, data: { verified: true } });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to verify OTP');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getNotificationStatus(request, reply) {
    try {
      const { tenantId } = request.user;
      const { id } = request.params;

      const notification = await prisma.notification.findFirst({
        where: { id, tenantId },
        include: { deliveryEvents: { orderBy: { eventTimestamp: 'asc' } } },
      });

      if (!notification) {
        return reply.code(404).send({ success: false, message: 'Notification not found' });
      }

      return reply.send({
        success: true,
        data: {
          id: notification.id,
          channel: notification.channel,
          recipient: notification.recipient,
          status: notification.deliveryStatus,
          notificationType: notification.notificationType,
          retryCount: notification.retryCount,
          createdAt: notification.createdAt,
          sentAt: notification.sentAt,
          events: notification.deliveryEvents,
        },
      });
    } catch (error) {
      logger.error(
        { error, tenantId: request.user?.tenantId },
        'Failed to get notification status',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async retryNotification(request, reply) {
    try {
      const { tenantId } = request.user;
      const { id } = request.params;

      const notification = await prisma.notification.findFirst({
        where: { id, tenantId },
      });

      if (!notification) {
        return reply.code(404).send({ success: false, message: 'Notification not found' });
      }

      if (notification.deliveryStatus !== 'FAILED') {
        return reply
          .code(400)
          .send({ success: false, message: 'Can only retry failed notifications' });
      }

      await deliveryTrackingService.markRetrying(id);

      const params = {
        tenantId,
        userId: notification.userId,
        patientId: notification.patientId,
        notificationType: notification.notificationType,
        channel: notification.channel,
        recipient: notification.recipient,
      };

      const result = await notificationService.queueNotification(params);

      if (!result.success) {
        const fallbackResult = await channelFallbackService.executeFallback(
          id,
          notification.channel,
          params,
        );
        return reply.send({ success: true, retry: result, fallback: fallbackResult });
      }

      return reply.send({ success: true, retry: result });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to retry notification');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getHistory(request, reply) {
    try {
      const { tenantId } = request.user;
      const { skip = 0, take = 20, channel, deliveryStatus, notificationType } = request.query;

      const where = { tenantId };
      if (channel) where.channel = channel;
      if (deliveryStatus) where.deliveryStatus = deliveryStatus;
      if (notificationType) where.notificationType = notificationType;

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: parseInt(skip),
          take: parseInt(take),
          include: { deliveryEvents: { orderBy: { eventTimestamp: 'desc' }, take: 5 } },
        }),
        prisma.notification.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          notifications,
          pagination: {
            total,
            skip: parseInt(skip),
            take: parseInt(take),
            hasMore: parseInt(skip) + parseInt(take) < total,
          },
        },
      });
    } catch (error) {
      logger.error(
        { error, tenantId: request.user?.tenantId },
        'Failed to fetch notification history',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getAnalytics(request, reply) {
    try {
      const { tenantId } = request.user;
      const { days = 30, channel } = request.query;

      const [deliveryStats, providerPerformance, responseTimes, channelUsage] = await Promise.all([
        notificationAnalyticsService.getDeliveryStats(tenantId, { days: parseInt(days), channel }),
        notificationAnalyticsService.getProviderPerformance(tenantId, { days: parseInt(days) }),
        notificationAnalyticsService.getResponseTimes(tenantId, { days: parseInt(days), channel }),
        notificationAnalyticsService.getChannelUsage(tenantId, { days: parseInt(days) }),
      ]);

      return reply.send({
        success: true,
        data: { deliveryStats, providerPerformance, responseTimes, channelUsage },
      });
    } catch (error) {
      logger.error(
        { error, tenantId: request.user?.tenantId },
        'Failed to fetch notification analytics',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getTemplates(request, reply) {
    try {
      const { tenantId } = request.user;
      const templates = await prisma.notificationTemplate.findMany({
        where: { OR: [{ tenantId }, { tenantId: null }] },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ success: true, data: templates });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to fetch templates');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async createTemplate(request, reply) {
    try {
      const { tenantId } = request.user;
      const { templateName, channel, templateBody, variables } = request.body;

      const template = await prisma.notificationTemplate.create({
        data: { tenantId, templateName, channel, templateBody, variables: variables || [] },
      });

      emitLocalEvent(DOMAIN_EVENTS.TEMPLATE_RENDERED, { tenantId, templateName, channel });
      return reply.code(201).send({ success: true, data: template });
    } catch (error) {
      if (error.code === 'P2002') {
        return reply
          .code(409)
          .send({ success: false, message: 'Template already exists for this channel and tenant' });
      }
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to create template');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async updateTemplate(request, reply) {
    try {
      const { tenantId } = request.user;
      const { id } = request.params;
      const { templateName, channel, templateBody, variables } = request.body;

      const existing = await prisma.notificationTemplate.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.code(404).send({ success: false, message: 'Template not found' });
      }

      const template = await prisma.notificationTemplate.update({
        where: { id },
        data: { templateName, channel, templateBody, variables },
      });

      return reply.send({ success: true, data: template });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to update template');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async deleteTemplate(request, reply) {
    try {
      const { tenantId } = request.user;
      const { id } = request.params;

      const existing = await prisma.notificationTemplate.findFirst({ where: { id, tenantId } });
      if (!existing) {
        return reply.code(404).send({ success: false, message: 'Template not found' });
      }

      await prisma.notificationTemplate.delete({ where: { id } });
      return reply.send({ success: true, message: 'Template deleted' });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to delete template');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async renderTemplate(request, reply) {
    try {
      const { tenantId } = request.user;
      const { templateName, channel, variables } = request.body;

      const rendered = await templateService.renderTemplate(
        tenantId,
        templateName,
        channel,
        variables,
      );
      return reply.send({ success: true, data: { rendered } });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async getThrottleStatus(request, reply) {
    try {
      const { tenantId } = request.user;
      const { channel } = request.query;
      const statuses = {};

      const channels = channel ? [channel.toUpperCase()] : ['SMS', 'WHATSAPP', 'EMAIL'];
      for (const ch of channels) {
        statuses[ch] = await throttlingService.getThrottleStatus(tenantId, ch);
      }

      return reply.send({ success: true, data: statuses });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to get throttle status');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getPatientPreferences(request, reply) {
    try {
      const { patientId } = request.params;
      const preferences = await patientPreferenceService.checkPatientConsent(patientId, null);
      return reply.send({ success: true, data: preferences });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async updatePatientPreferences(request, reply) {
    try {
      const { patientId } = request.params;
      const result = await patientPreferenceService.updatePatientConsent(patientId, request.body);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getSettings(request, reply) {
    try {
      const { tenantId } = request.user;
      const { branchId } = request.query;

      const where = { tenantId };
      if (branchId) where.branchId = branchId;

      const settings = await prisma.notificationSettings.findFirst({ where });
      if (!settings) {
        return reply.code(404).send({ success: false, message: 'Notification settings not found' });
      }

      const channelConfigs = await prisma.notificationChannelConfig.findMany({
        where: { tenantId, settingsId: settings.id },
      });

      return reply.send({ success: true, data: { ...settings, channelConfigs } });
    } catch (error) {
      logger.error(
        { error, tenantId: request.user?.tenantId },
        'Failed to get notification settings',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async updateSettings(request, reply) {
    try {
      const { tenantId, id: userId } = request.user;
      const { branchId, ...settingsData } = request.body;

      let settings = await prisma.notificationSettings.findFirst({
        where: { tenantId, branchId: branchId || null },
      });

      if (settings) {
        settings = await prisma.notificationSettings.update({
          where: { id: settings.id },
          data: { ...settingsData, updatedBy: userId },
        });
      } else {
        settings = await prisma.notificationSettings.create({
          data: { tenantId, branchId: branchId || null, ...settingsData, updatedBy: userId },
        });
      }

      emitLocalEvent(DOMAIN_EVENTS.SETTINGS_UPDATED, { tenantId, settingsId: settings.id });
      return reply.send({ success: true, data: settings });
    } catch (error) {
      logger.error(
        { error, tenantId: request.user?.tenantId },
        'Failed to update notification settings',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getProviderConfigs(request, reply) {
    try {
      const { tenantId } = request.user;
      const { channelType } = request.query;

      const where = { tenantId };
      if (channelType) where.channelType = channelType;

      const configs = await prisma.notificationChannelConfig.findMany({
        where,
        orderBy: [{ channelType: 'asc' }, { priority: 'desc' }],
      });

      return reply.send({ success: true, data: configs });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to get provider configs');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async upsertProviderConfig(request, reply) {
    try {
      const { tenantId } = request.user;
      const {
        channelType,
        providerName,
        providerConfig,
        isActive,
        priority,
        dailyLimit,
        rateLimitPerMinute,
      } = request.body;

      const config = await prisma.notificationChannelConfig.upsert({
        where: { tenantId_channelType_providerName: { tenantId, channelType, providerName } },
        update: { providerConfig, isActive, priority, dailyLimit, rateLimitPerMinute },
        create: {
          tenantId,
          channelType,
          providerName,
          providerConfig,
          isActive,
          priority,
          dailyLimit,
          rateLimitPerMinute,
        },
      });

      return reply.send({ success: true, data: config });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to upsert provider config');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getRetryLogs(request, reply) {
    try {
      const { tenantId } = request.user;
      const { status, skip = 0, take = 20 } = request.query;

      const where = { tenantId };
      if (status) where.status = status;

      const [logs, total] = await Promise.all([
        prisma.notificationRetryLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: parseInt(skip),
          take: parseInt(take),
        }),
        prisma.notificationRetryLog.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: { logs, pagination: { total, skip: parseInt(skip), take: parseInt(take) } },
      });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to get retry logs');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getOpsHistory(request, reply) {
    try {
      const { tenantId } = request.user;
      const { take = 100 } = request.query;

      const history = await prisma.notification.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: parseInt(take),
        include: {
          deliveryEvents: {
            orderBy: { eventTimestamp: 'desc' },
            take: 1,
          },
        },
      });

      return reply.send({
        success: true,
        data: { notifications: history },
      });
    } catch (error) {
      logger.error(
        { error, tenantId: request.user?.tenantId },
        'Failed to fetch notification ops history',
      );
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getQueueMetrics(request, reply) {
    try {
      const metrics = await queueService.getMetrics();
      return reply.send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to fetch notification queue metrics');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getUserNotifications(request, reply) {
    try {
      const { tenantId, id: userId } = request.user;
      const { page = 1, limit = 50, isRead } = request.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);

      const where = { tenantId, userId };
      if (isRead !== undefined) where.isRead = isRead === 'true';

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        prisma.notification.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: notifications,
        pagination: {
          total,
          page: parseInt(page),
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      });
    } catch (error) {
      logger.error({ error, userId: request.user?.id }, 'Failed to fetch user notifications');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async markNotificationRead(request, reply) {
    try {
      const { id } = request.params;
      const { tenantId, id: userId } = request.user;

      const notification = await prisma.notification.findFirst({
        where: { id, tenantId, userId },
      });
      if (!notification) {
        return reply.code(404).send({ success: false, message: 'Notification not found' });
      }

      await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });

      return reply.send({ success: true, data: { message: 'Notification marked as read' } });
    } catch (error) {
      logger.error({ error }, 'Failed to mark notification as read');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async markAllNotificationsRead(request, reply) {
    try {
      const { tenantId, id: userId } = request.user;

      await prisma.notification.updateMany({
        where: { tenantId, userId, isRead: false },
        data: { isRead: true },
      });

      return reply.send({ success: true, data: { message: 'All notifications marked as read' } });
    } catch (error) {
      logger.error({ error }, 'Failed to mark all notifications as read');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async deleteUserNotification(request, reply) {
    try {
      const { id } = request.params;
      const { tenantId, id: userId } = request.user;

      const notification = await prisma.notification.findFirst({
        where: { id, tenantId, userId },
      });
      if (!notification) {
        return reply.code(404).send({ success: false, message: 'Notification not found' });
      }

      await prisma.notification.delete({ where: { id } });

      return reply.send({ success: true, data: { message: 'Notification deleted' } });
    } catch (error) {
      logger.error({ error }, 'Failed to delete notification');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new NotificationFastifyController();
