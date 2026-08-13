export const COMMUNICATION_TEMPLATES = {
  REFILL_DUE: {
    name: 'REFILL_DUE',
    channels: ['WHATSAPP', 'SMS', 'EMAIL'],
    description: 'Medication refill is due notification',
  },
  REFILL_OVERDUE: {
    name: 'REFILL_OVERDUE',
    channels: ['WHATSAPP', 'SMS'],
    description: 'Medication refill is overdue escalation',
  },
  PRESCRIPTION_EXPIRING: {
    name: 'PRESCRIPTION_EXPIRING',
    channels: ['WHATSAPP', 'SMS', 'EMAIL'],
    description: 'Prescription is about to expire',
  },
  PRESCRIPTION_EXPIRED: {
    name: 'PRESCRIPTION_EXPIRED',
    channels: ['WHATSAPP', 'SMS'],
    description: 'Prescription has expired - renewal needed',
  },
  INVOICE_DELIVERY: {
    name: 'INVOICE_DELIVERY',
    channels: ['EMAIL', 'WHATSAPP'],
    description: 'Invoice PDF delivery notification',
  },
  PAYMENT_RECEIPT: {
    name: 'PAYMENT_RECEIPT',
    channels: ['EMAIL', 'WHATSAPP'],
    description: 'Payment receipt delivery',
  },
  APPOINTMENT_REMINDER: {
    name: 'APPOINTMENT_REMINDER',
    channels: ['WHATSAPP', 'SMS'],
    description: 'Upcoming appointment reminder',
  },
};

export const ADHERENCE_THRESHOLDS = {
  REFILL_WINDOW_DAYS: 3,
  OVERDUE_WARNING_DAYS: 7,
  CRITICAL_DAYS: 14,
  SCHEDULE_H_EXPIRY_DAYS: 30,
};
