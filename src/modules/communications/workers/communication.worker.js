import { Worker } from 'bullmq';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { getBullRedis } from '../../../config/redis.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { DOMAIN_EVENTS, EVENTS } from '../../../shared/constants/events.js';

function buildMessage(patientName, reminderType, medicineName = {}) {
  const messages = {
    REFILL_DUE: `Hello ${patientName}, your refill for ${medicineName || 'your medication'} is due soon. Please visit the pharmacy to ensure continuity of your treatment.`,
    REFILL_OVERDUE: `URGENT: ${patientName}, your refill for ${medicineName || 'your medication'} was due. Missing doses can impact your health. Please visit us immediately.`,
    PRESCRIPTION_EXPIRING: `Hello ${patientName}, your prescription for ${medicineName || 'your medication'} is expiring soon. Please consult your doctor for a new prescription.`,
    PRESCRIPTION_EXPIRED: `ATTENTION ${patientName}: Your prescription for ${medicineName || 'your medication'} has expired. A new prescription is required before we can dispense. Please contact your doctor.`,
    INVOICE_DELIVERY: `Dear ${patientName}, please find your invoice attached.`,
    PAYMENT_RECEIPT: `Dear ${patientName}, thank you for your payment. Your receipt is attached.`,
  };
  return messages[reminderType] || `Hello ${patientName}, this is a reminder from your pharmacy.`;
}

async function initWorker() {
  const connection = getBullRedis();

  const worker = new Worker('communications', async (job) => {
    const { name, data } = job;
    logger.info({ jobId: job.id, name, patientId: data.patientId }, 'Processing communication job');

    try {
      switch (name) {
        case 'send-reminder':
          await handleSendReminder(data);
          break;
        case 'send-invoice':
          await handleSendInvoice(data);
          break;
        case 'adherence-escalation':
          await handleAdherenceEscalation(data);
          break;
        default:
          logger.warn({ jobName: name }, 'Unknown communication job type');
      }
    } catch (error) {
      logger.error({ error, jobId: job.id, name }, 'Communication job failed');
      if (data.notificationId) {
        await updateDeliveryStatus(data.notificationId, 'FAILED', error.message);
      }
      throw error;
    }
  }, { connection });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Communication job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job.id, name: job?.name, error: err.message }, 'Communication job failed');
  });

  logger.info('Communications worker initialized');
  return worker;
}

async function handleSendReminder(data) {
  const { notificationId, refillReminderId, patientName, recipient, channel, reminderType, medicineName } = data;

  const message = buildMessage(patientName, reminderType, medicineName, data);

  if (!recipient && channel !== 'EMAIL') {
    await updateDeliveryStatus(notificationId, 'FAILED', 'No phone number');
    if (refillReminderId) await updateRefillReminderStatus(refillReminderId, 'FAILED');
    return { status: 'FAILED' };
  }

  await prisma.notificationDeliveryEvent.create({
    data: { notificationId, eventType: 'PROCESSING', eventTimestamp: new Date() },
  });

  await prisma.notification.update({
    where: { id: notificationId },
    data: { message, deliveryStatus: 'SENT' },
  });

  const event = channel === 'WHATSAPP'
    ? EVENTS.INVOICE_WHATSAPP_SENT
    : channel === 'SMS'
      ? DOMAIN_EVENTS.SMS_SENT
      : DOMAIN_EVENTS.NOTIFICATION_SENT;
  emitLocalEvent(event, { notificationId, patientId: data.patientId, channel, reminderType, tenantId: data.tenantId });
  emitLocalEvent(DOMAIN_EVENTS.REMINDER_SENT, { notificationId, reminderType, patientId: data.patientId });

  await prisma.notificationDeliveryEvent.create({
    data: { notificationId, eventType: 'SENT', eventTimestamp: new Date() },
  });

  if (refillReminderId) {
    await updateRefillReminderStatus(refillReminderId, 'SENT');
  }

  return { status: 'SENT' };
}

async function handleSendInvoice(data) {
  const { notificationId, patientName, recipient, channel, invoiceNumber } = data;
  const message = buildMessage(patientName, 'INVOICE_DELIVERY', null, { invoiceNumber });

  if (!recipient && channel !== 'EMAIL') {
    const fallbackChain = data.fallbackChain || [];
    const currentIndex = fallbackChain.indexOf(channel);
    const nextChannel = currentIndex >= 0 && currentIndex + 1 < fallbackChain.length
      ? fallbackChain[currentIndex + 1]
      : null;

    if (nextChannel) {
      logger.info({ notificationId, fallbackTo: nextChannel }, 'Falling back to alternative channel');
      await updateDeliveryStatus(notificationId, 'QUEUED', `Fallback to ${nextChannel}`);
      const fallbackRecipient = nextChannel === 'EMAIL' ? data.patientEmail : recipient;

      const { default: commQueue } = await import('../queues/communication.queue.js');
      await commQueue.add('send-invoice', { ...data, channel: nextChannel, recipient: fallbackRecipient });
      return { status: 'FALLBACK' };
    }

    await updateDeliveryStatus(notificationId, 'FAILED', 'No recipient');
    return { status: 'FAILED' };
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: { message, deliveryStatus: 'SENT' },
  });

  await prisma.notificationDeliveryEvent.create({
    data: { notificationId, eventType: 'SENT', eventTimestamp: new Date() },
  });

  const event = channel === 'EMAIL' ? EVENTS.INVOICE_EMAIL_SENT : EVENTS.INVOICE_WHATSAPP_SENT;
  emitLocalEvent(event, { notificationId, invoiceNumber, patientId: data.patientId, channel });
  emitLocalEvent(DOMAIN_EVENTS.NOTIFICATION_SENT, { notificationId, type: 'INVOICE', channel });

  return { status: 'SENT' };
}

async function handleAdherenceEscalation(data) {
  const { tenantId, patientName, medicineName, adherenceStatus } = data;

  await prisma.notification.create({
    data: {
      tenantId,
      notificationType: 'ADHERENCE_ESCALATION',
      channel: 'IN_APP',
      recipient: 'BRANCH_PHARMACIST',
      message: `${adherenceStatus} ADHERENCE: Patient ${patientName} requires follow-up for ${medicineName}`,
      deliveryStatus: 'QUEUED',
    },
  });

  emitLocalEvent(DOMAIN_EVENTS.ADHERENCE_ALERT, { tenantId, patientName, medicineName, adherenceStatus });
}

async function updateDeliveryStatus(notificationId, status, errorMessage) {
  if (!notificationId) return;
  const data = { deliveryStatus: status };
  if (errorMessage) data.errorMessage = errorMessage;
  if (status === 'SENT' || status === 'DELIVERED') data.sentAt = new Date();

  await prisma.notification.update({ where: { id: notificationId }, data });

  await prisma.notificationDeliveryEvent.create({
    data: {
      notificationId,
      eventType: status === 'FAILED' ? 'FAILED' : status === 'SENT' ? 'SENT' : 'RETRYING',
      errorMessage,
      eventTimestamp: new Date(),
    },
  });
}

async function updateRefillReminderStatus(refillReminderId, status) {
  if (!refillReminderId) return;
  const data = { deliveryStatus: status };
  if (status === 'SENT') data.sentAt = new Date();
  await prisma.patientRefillReminder.update({ where: { id: refillReminderId }, data });
}

let workerInstance;

export async function startCommunicationWorker() {
  if (!workerInstance) {
    workerInstance = await initWorker();
  }
  return workerInstance;
}

export async function stopCommunicationWorker() {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}

export default { startCommunicationWorker, stopCommunicationWorker };
