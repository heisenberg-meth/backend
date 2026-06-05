import { z } from 'zod';

export const notificationSettingsSchema = z.object({
  // Channel toggles
  smsEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),

  // Reminder policies
  refillReminderDaysBefore: z.number().int().min(1).max(30).optional(),
  appointmentReminderHoursBefore: z.number().int().min(1).max(168).optional(),
  expiryReminderDaysBefore: z.number().int().min(1).max(90).optional(),

  // Retry infrastructure
  maxRetries: z.number().int().min(0).max(10).optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
  retryBackoffStrategy: z.enum(['linear', 'exponential', 'fixed']).optional(),

  // Escalation
  criticalEscalationEnabled: z.boolean().optional(),
  escalationTimeoutMinutes: z.number().int().min(5).max(1440).optional(),
  maxEscalationLevels: z.number().int().min(1).max(5).optional(),

  // Throttling
  maxNotificationsPerHour: z.number().int().min(1).max(1000).optional(),
  maxRemindersPerDay: z.number().int().min(1).max(50).optional(),
  duplicateSuppressionMinutes: z.number().int().min(1).max(1440).optional(),

  // Compliance
  respectOptOuts: z.boolean().optional(),
  consentRequired: z.boolean().optional(),
  defaultFallbackChannel: z.enum(['sms', 'whatsapp', 'email', 'in_app', 'push']).optional(),
});

export const channelConfigSchema = z.object({
  channelType: z.enum(['SMS', 'WHATSAPP', 'EMAIL', 'PUSH', 'IN_APP']),
  providerName: z.string().min(1).max(100),
  providerConfig: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  dailyLimit: z.number().int().min(1).optional().nullable(),
  rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
});

export const escalationPolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional().nullable(),
  triggerType: z.enum(['time_based', 'count_based', 'severity_based']),
  isActive: z.boolean().optional(),
  triggerCondition: z.record(z.string(), z.any()),
  escalationChain: z
    .array(
      z.object({
        level: z.number().int().min(1).max(5),
        role: z.string(),
        channels: z.array(z.string()),
      }),
    )
    .min(1)
    .max(5),
  appliesTo: z.enum(['all', 'stock_alerts', 'refill_reminders', 'critical_only']).optional(),
  rules: z
    .array(
      z.object({
        level: z.number().int().min(1).max(5),
        condition: z.record(z.string(), z.any()),
        notifyRoles: z.array(z.string()).min(1),
        notifyChannels: z.array(z.string()).min(1),
        templateKey: z.string().max(255).optional().nullable(),
        autoRepeatMinutes: z.number().int().min(1).max(1440).optional().nullable(),
      }),
    )
    .optional(),
});

export const reminderRuleSchema = z.object({
  name: z.string().min(1).max(255),
  reminderType: z.enum(['refill', 'appointment', 'expiry', 'followup', 'lab_result']),
  isActive: z.boolean().optional(),
  offsetDays: z.number().int().min(0).max(365),
  offsetHours: z.number().int().min(0).max(23).optional(),
  channels: z.array(z.string()).min(1).max(5),
  templateKey: z.string().max(255).optional().nullable(),
  patientFilter: z.record(z.string(), z.any()).optional().nullable(),
  medicineFilter: z.record(z.string(), z.any()).optional().nullable(),
  maxPerDay: z.number().int().min(1).max(20).optional(),
  cooldownHours: z.number().int().min(1).max(168).optional(),
});

export const optOutSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  phoneNumber: z.string().max(20).optional().nullable(),
  email: z.string().email().optional().nullable(),
  channel: z.enum(['SMS', 'WHATSAPP', 'EMAIL', 'PUSH', 'IN_APP']).optional().nullable(),
  reminderType: z
    .enum(['refill', 'appointment', 'expiry', 'followup', 'lab_result'])
    .optional()
    .nullable(),
  reason: z.string().max(255).optional().nullable(),
});

export const testNotificationSchema = z.object({
  channel: z.enum(['sms', 'whatsapp', 'email', 'in_app']),
  recipient: z.string().min(1),
  message: z.string().min(1).max(1000).optional(),
});
