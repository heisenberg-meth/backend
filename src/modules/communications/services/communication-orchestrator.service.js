import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import reminderAnalyzerService from './reminder-analyzer.service.js';
import templateSelectorService from './template-selector.service.js';
import invoiceDeliveryService from './invoice-delivery.service.js';
import communicationQueue from '../queues/communication.queue.js';

class CommunicationOrchestratorService {
  async sendRefillReminder(patientId, tenantId, options = {}) {
    const { channel: preferredChannel } = options;
    const { patient, reminders } = await reminderAnalyzerService.analyzePatientRefills(patientId, tenantId);

    if (reminders.length === 0) {
      return { success: true, message: 'No refill reminders needed at this time', remindersSent: 0 };
    }

    const results = [];
    for (const reminder of reminders) {
      const eligibility = await reminderAnalyzerService.getRefillEligibility(patientId, reminder.medicineId, tenantId);
      if (!eligibility.eligible) {
        results.push({ medicineId: reminder.medicineId, reason: eligibility.reason, sent: false });
        continue;
      }

      const channel = templateSelectorService.selectBestChannel(patient, reminder.reminderType, preferredChannel);
      if (!channel) {
        results.push({ medicineId: reminder.medicineId, reason: 'No suitable channel', sent: false });
        continue;
      }

      const notification = await prisma.notification.create({
        data: {
          tenantId, patientId,
          channel,
          notificationType: 'REFILL_REMINDER',
          recipient: channel === 'EMAIL' ? patient.email : patient.phone,
          subject: reminder.reminderType,
          message: '',
          deliveryStatus: 'QUEUED',
        },
      });

      const refillReminder = await prisma.patientRefillReminder.create({
        data: {
          tenantId, patientId, medicineId: reminder.medicineId,
          refillId: '', reminderType: reminder.reminderType,
          scheduledAt: new Date(), channel,
          deliveryStatus: 'PENDING',
        },
      });

      const fallbackChain = templateSelectorService.buildFallbackChain(patient, reminder.reminderType, channel);

      await communicationQueue.add('send-reminder', {
        notificationId: notification.id,
        refillReminderId: refillReminder.id,
        tenantId, patientId: patient.id,
        patientName: patient.fullName,
        recipient: channel === 'EMAIL' ? patient.email : patient.phone,
        channel, reminderType: reminder.reminderType,
        medicineName: reminder.medicineName, dosage: reminder.dosage,
        priority: reminder.priority, isScheduleH: reminder.isScheduleH,
        prescriptionEnd: reminder.prescriptionEnd,
        expectedRefillAt: reminder.expectedRefillAt,
        fallbackChain,
      });

      await prisma.patientRefill.upsert({
        where: { tenantId_patientId_medicineId: { tenantId, patientId, medicineId: reminder.medicineId } },
        create: { tenantId, patientId, medicineId: reminder.medicineId, lastReminderSent: new Date(), reminderChannel: channel },
        update: { lastReminderSent: new Date(), reminderChannel: channel },
      });

      emitLocalEvent(DOMAIN_EVENTS.REFILL_DUE, { patientId, medicineId: reminder.medicineId, tenantId, channel, reminderType: reminder.reminderType });

      results.push({ medicineId: reminder.medicineId, sent: true, channel, notificationId: notification.id });
    }

    const sent = results.filter(r => r.sent).length;
    logger.info({ patientId, sent, total: reminders.length }, 'Refill reminders processed');
    return { success: true, remindersSent: sent, total: reminders.length, results };
  }

  async sendPrescriptionReminder(patientId, tenantId, options = {}) {
    const { channel: preferredChannel } = options;
    const { patient, reminders } = await reminderAnalyzerService.analyzePatientRefills(patientId, tenantId);

    const expiring = reminders.filter(r =>
      r.reminderType === 'PRESCRIPTION_EXPIRING' || r.reminderType === 'PRESCRIPTION_EXPIRED',
    );

    if (expiring.length === 0) {
      return { success: true, message: 'No prescription reminders needed at this time', remindersSent: 0 };
    }

    const results = [];
    for (const reminder of expiring) {
      const channel = templateSelectorService.selectBestChannel(patient, reminder.reminderType, preferredChannel);
      if (!channel) {
        results.push({ medicineId: reminder.medicineId, reason: 'No suitable channel', sent: false });
        continue;
      }

      const notification = await prisma.notification.create({
        data: {
          tenantId, patientId, channel,
          notificationType: 'PRESCRIPTION_REMINDER',
          recipient: channel === 'EMAIL' ? patient.email : patient.phone,
          subject: reminder.reminderType,
          message: '',
          deliveryStatus: 'QUEUED',
        },
      });

      await communicationQueue.add('send-reminder', {
        notificationId: notification.id,
        tenantId, patientId: patient.id, patientName: patient.fullName,
        recipient: channel === 'EMAIL' ? patient.email : patient.phone,
        channel, reminderType: reminder.reminderType,
        medicineName: reminder.medicineName, isScheduleH: reminder.isScheduleH,
        prescriptionEnd: reminder.prescriptionEnd, priority: reminder.priority,
        fallbackChain: templateSelectorService.buildFallbackChain(patient, reminder.reminderType, channel),
      });

      emitLocalEvent(DOMAIN_EVENTS.PRESCRIPTION_EXPIRING, { patientId, medicineId: reminder.medicineId, tenantId, channel });

      results.push({ medicineId: reminder.medicineId, sent: true, channel, notificationId: notification.id });
    }

    return { success: true, remindersSent: results.filter(r => r.sent).length, results };
  }

  async sendInvoice(patientId, tenantId, options = {}) {
    const { invoiceId, channel: preferredChannel } = options;
    if (!invoiceId) throw new Error('invoiceId is required');
    return invoiceDeliveryService.sendInvoice(patientId, invoiceId, tenantId, preferredChannel);
  }

  async getCommunicationStatus(notificationId) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: { deliveryEvents: { orderBy: { eventTimestamp: 'desc' } } },
    });
    if (!notification) throw new Error('Communication not found');
    return notification;
  }

  async getPatientCommunications(patientId, tenantId, options = {}) {
    const { page = 1, limit = 20, channel, notificationType, deliveryStatus } = options;
    const where = { patientId, tenantId };

    if (channel) where.channel = channel;
    if (notificationType) where.notificationType = notificationType;
    if (deliveryStatus) where.deliveryStatus = deliveryStatus;

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: (parseInt(page) - 1) * parseInt(limit),
      }),
      prisma.notification.count({ where }),
    ]);

    return { data, total, page: parseInt(page), limit: parseInt(limit) };
  }

  async retryCommunication(notificationId, tenantId) {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new Error('Communication not found');

    if (notification.deliveryStatus === 'DELIVERED') {
      throw new Error('Communication already delivered');
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveryStatus: 'QUEUED', retryCount: { increment: 1 } },
    });

    await prisma.notificationDeliveryEvent.create({
      data: {
        notificationId,
        eventType: 'RETRYING',
        eventTimestamp: new Date(),
      },
    });

    if (notification.notificationType === 'INVOICE' || notification.notificationType?.startsWith('INVOICE')) {
      await communicationQueue.add('send-invoice', {
        notificationId, tenantId, patientId: notification.patientId,
        channel: notification.channel, recipient: notification.recipient,
      });
    } else {
      await communicationQueue.add('send-reminder', {
        notificationId, tenantId, patientId: notification.patientId,
        channel: notification.channel, recipient: notification.recipient,
        reminderType: notification.subject,
      });
    }

    return notification;
  }

  async updatePatientPreferences(patientId, tenantId, preferences) {
    const allowed = ['allowSms', 'allowWhatsapp', 'allowEmail'];
    const data = {};
    for (const key of Object.keys(preferences)) {
      if (allowed.includes(key)) {
        data[key] = preferences[key];
      }
    }

    if (Object.keys(data).length === 0) {
      throw new Error('No valid preference fields provided. Allowed: allowSms, allowWhatsapp, allowEmail');
    }

    const patient = await prisma.patient.update({
      where: { id: patientId },
      data,
      select: { id: true, fullName: true, allowSms: true, allowWhatsapp: true, allowEmail: true },
    });

    return patient;
  }
}

export default new CommunicationOrchestratorService();
