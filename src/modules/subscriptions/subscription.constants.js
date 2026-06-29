import { SubscriptionStatus } from '../../packages/enums.js';

export const TRIAL_PLAN_ID = 'free-trial';

export const SUBSCRIPTION_PLANS = {
  'free-trial': {
    id: 'free-trial',
    name: 'Free Trial',
    price: 0,
    billingCycle: 'one-time',
    features: [
      'CREDIT_NOTES',
      'REPORTS_PDF',
      'REPORTS_EXCEL',
      'ADVANCED_REPORTS',
      'PREMIUM_ANALYTICS',
    ],
    limits: { users: 5, branches: 1, /* medicines: 1000, */ batches: 5000 },
  },
  free: {
    id: 'free',
    name: 'Free Plan',
    price: 0,
    billingCycle: 'monthly',
    features: [],
    limits: { users: 1, branches: 1, /* medicines: 100, */ batches: 500 },
  },
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    price: 999,
    billingCycle: 'monthly',
    features: ['CREDIT_NOTES', 'REPORTS_PDF'],
    limits: { users: 3, branches: 2, /* medicines: 5000, */ batches: 10000 },
  },
  professional: {
    id: 'professional',
    name: 'Professional Plan',
    price: 2999,
    billingCycle: 'monthly',
    features: ['CREDIT_NOTES', 'REPORTS_PDF', 'REPORTS_EXCEL', 'PREMIUM_ANALYTICS'],
    limits: { users: 10, branches: 5, /* medicines: 20000, */ batches: 50000 },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Plan',
    price: 9999,
    billingCycle: 'monthly',
    features: [
      'CREDIT_NOTES',
      'REPORTS_PDF',
      'REPORTS_EXCEL',
      'ADVANCED_REPORTS',
      'PREMIUM_ANALYTICS',
    ],
    limits: { users: -1, branches: -1, /* medicines: -1, */ batches: -1 }, // -1 implies unlimited
  },
};

export const SUBSCRIPTION_STATUS = SubscriptionStatus;

export const TRIAL_DAYS = 28;
export const GRACE_PERIOD_DAYS = 3;

export const ALLOWED_TRANSITIONS = {
  TRIAL: ['ACTIVE', 'EXPIRED'],
  PENDING: ['ACTIVE', 'FAILED'],
  ACTIVE: ['GRACE_PERIOD', 'CANCELLED', 'EXPIRED', 'SUSPENDED'],
  GRACE_PERIOD: ['ACTIVE', 'EXPIRED', 'SUSPENDED'],
  EXPIRED: ['ACTIVE'],
  SUSPENDED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: [],
};
