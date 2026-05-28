import { z } from 'zod';

export const sendEmailSchema = z.object({
  to: z.array(z.string().email('Invalid email address')).min(1, 'At least one recipient required'),
  subject: z.string().min(1, 'Subject required').max(255).optional(),
  template: z.string().min(1, 'Template name required').max(100).optional(),
  data: z.record(z.string(), z.any()).optional(),
  notificationType: z.string().max(50).optional(),
}).refine((data) => {
  if (!data.template && !data.subject) {
    return false;
  }
  return true;
});

export const sendSmsSchema = z.object({
  phoneNumber: z.string().min(10, 'Invalid phone number').max(15),
  template: z.string().min(1, 'Template required for SMS').max(100),
  data: z.record(z.string(), z.any()).optional(),
  notificationType: z.string().max(50).optional(),
});

export const sendWhatsAppSchema = z.object({
  phoneNumber: z.string().min(10, 'Invalid phone number').max(15),
  template: z.string().min(1, 'Template required for WhatsApp').max(100),
  data: z.record(z.string(), z.any()).optional(),
  notificationType: z.string().max(50).optional(),
});

export const sendPushSchema = z.object({
  deviceToken: z.string().min(1, 'Device token required'),
  title: z.string().min(1).max(255),
  body: z.string().min(1),
  data: z.record(z.string(), z.any()).optional(),
  notificationType: z.string().max(50).optional(),
});

export const sendOtpSchema = z.object({
  recipient: z.string().min(1, 'Recipient required'),
  channel: z.enum(['SMS', 'EMAIL', 'WHATSAPP']).optional().default('SMS'),
});

export const verifyOtpSchema = z.object({
  recipient: z.string().min(1, 'Recipient required'),
  otp: z.string().length(6, 'OTP must be 6 digits'),
  channel: z.enum(['SMS', 'EMAIL', 'WHATSAPP']).optional().default('SMS'),
});

export const notificationHistorySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP', 'PUSH']).optional(),
  deliveryStatus: z.enum(['PENDING', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'RETRYING']).optional(),
  notificationType: z.string().max(50).optional(),
});

export const notificationAnalyticsSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP', 'PUSH']).optional(),
});

export const createTemplateSchema = z.object({
  templateName: z.string().min(1).max(255),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP', 'PUSH']),
  templateBody: z.string().min(1),
  variables: z.array(z.string()).optional(),
});

export const updateTemplateSchema = z.object({
  templateName: z.string().min(1).max(255).optional(),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP', 'PUSH']).optional(),
  templateBody: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
});

export const renderTemplateSchema = z.object({
  templateName: z.string().min(1),
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP', 'PUSH']),
  variables: z.record(z.string(), z.string()).optional(),
});

export const updatePreferenceSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'IN_APP']),
  notificationType: z.string().min(1).max(50),
  enabled: z.boolean(),
});

export const sendSchema = z.object({
  channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'PUSH']),
  recipient: z.string().min(1),
  template: z.string().min(1).optional(),
  variables: z.record(z.string(), z.any()).optional(),
  patientId: z.string().uuid().optional(),
  notificationType: z.string().max(50).optional(),
});

export const patientPreferenceSchema = z.object({
  allowSms: z.boolean().optional(),
  allowWhatsApp: z.boolean().optional(),
  allowEmail: z.boolean().optional(),
});

export const updateSettingsSchema = z.object({
  branchId: z.string().optional(),
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  refillReminderDaysBefore: z.number().int().min(0).optional(),
  appointmentReminderHoursBefore: z.number().int().min(0).optional(),
  expiryReminderDaysBefore: z.number().int().min(0).optional(),
  maxRetries: z.number().int().min(0).optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
  retryBackoffStrategy: z.enum(['linear', 'exponential', 'fixed']).optional(),
  criticalEscalationEnabled: z.boolean().optional(),
  escalationTimeoutMinutes: z.number().int().min(0).optional(),
  maxEscalationLevels: z.number().int().min(0).optional(),
  maxNotificationsPerHour: z.number().int().min(0).optional(),
  maxRemindersPerDay: z.number().int().min(0).optional(),
  duplicateSuppressionMinutes: z.number().int().min(0).optional(),
  respectOptOuts: z.boolean().optional(),
  consentRequired: z.boolean().optional(),
  defaultFallbackChannel: z.string().optional(),
});

export const upsertProviderConfigSchema = z.object({
  channelType: z.enum(['SMS', 'WHATSAPP', 'EMAIL', 'PUSH', 'IN_APP']),
  providerName: z.string().min(1).max(100),
  providerConfig: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().optional(),
  dailyLimit: z.number().int().optional().nullable(),
  rateLimitPerMinute: z.number().int().optional(),
});
