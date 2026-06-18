import prisma from '../../../config/prisma.js';
import behaviorService from '../services/behavior.service.js';
import segmentationService from '../services/segmentation.service.js';
import subscriptionService from '../services/subscription.service.js';
import { notificationQueue } from '../../notifications/queue/notification.queue.js';
import logger from '../../../shared/utils/logger.js';

class CrmController {
  async getBehavior(request, reply) {
    try {
      const { tenantId } = request.user;
      const { id: patientId } = request.params;

      // Automatically trigger behavior analysis first to keep it up to date
      await behaviorService.analyzeBehavior(tenantId, patientId);

      const behavior = await prisma.patientBehavior.findMany({
        where: { tenantId, patientId },
        include: { medicine: true },
      });

      return reply.send({ success: true, data: behavior });
    } catch (error) {
      logger.error({ error, patientId: request.params?.id }, 'Failed to get patient behavior');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSegments(request, reply) {
    try {
      const { tenantId } = request.user;

      // Update patient segments before retrieving
      await segmentationService.updateSegments(tenantId);

      const segments = await prisma.patientSegment.findMany({
        where: { patient: { tenantId } },
        include: { patient: true },
      });

      return reply.send({ success: true, data: segments });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to get patient segments');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getReminders(request, reply) {
    try {
      const { tenantId } = request.user;

      const reminders = await prisma.patientReminder.findMany({
        where: { tenantId },
        include: { patient: true, medicine: true },
      });

      return reply.send({ success: true, data: reminders });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to get reminders');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async createReminder(request, reply) {
    try {
      const { tenantId } = request.user;
      const {
        patientId,
        medicineId,
        reminderType,
        frequency,
        reminderTime,
        nextReminderAt,
        reminderChannel,
      } = request.body;

      const reminder = await prisma.patientReminder.create({
        data: {
          tenantId,
          patientId,
          medicineId,
          reminderType,
          frequency,
          reminderTime,
          nextReminderAt: nextReminderAt ? new Date(nextReminderAt) : null,
          reminderChannel,
        },
      });

      return reply.code(201).send({ success: true, data: reminder });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to create reminder');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getSubscriptions(request, reply) {
    try {
      const { tenantId } = request.user;

      const subscriptions = await prisma.medicineSubscription.findMany({
        where: { tenantId },
        include: { patient: true, medicine: true },
      });

      return reply.send({ success: true, data: subscriptions });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to get subscriptions');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async createSubscription(request, reply) {
    try {
      const { tenantId } = request.user;

      const subscription = await subscriptionService.createSubscription(tenantId, request.body);

      return reply.code(201).send({ success: true, data: subscription });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to create subscription');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async launchCampaign(request, reply) {
    try {
      const { tenantId } = request.user;
      const { segmentName, message } = request.body;

      if (!segmentName || !message) {
        return reply.code(400).send({ success: false, message: 'segmentName and message are required' });
      }

      const patientSegments = await prisma.patientSegment.findMany({
        where: {
          segmentName,
          patient: { tenantId },
        },
        include: { patient: true },
      });

      let sentCount = 0;
      for (const ps of patientSegments) {
        if (ps.patient.phone) {
          const personalizedMessage = message.replace('{{name}}', ps.patient.fullName);
          await notificationQueue.add('send-sms', {
            tenantId,
            recipient: ps.patient.phone,
            message: personalizedMessage,
            subject: `Campaign: ${segmentName}`,
            notificationId: `crm-campaign-${ps.id}-${Date.now()}`,
          });
          sentCount++;
        }
      }

      return reply.send({
        success: true,
        message: `Campaign launched successfully. Queued ${sentCount} messages for segment ${segmentName}.`,
      });
    } catch (error) {
      logger.error({ error, tenantId: request.user?.tenantId }, 'Failed to launch campaign');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new CrmController();
