import { SubscriptionStatus } from '@viyan/contracts';

export const TRIAL_PLAN_ID = 'free-trial';

export const SUBSCRIPTION_PLANS = {
  'free-trial': {
    id: 'free-trial',
    name: 'Free Trial',
    price: 0,
    billingCycle: 'one-time',
    features: ['28-day free trial', 'Full feature access', 'Up to 5 users'],
  },
  'basic-monthly': {
    id: 'basic-monthly',
    name: 'Basic Monthly',
    price: 999,
    billingCycle: 'monthly',
    features: ['Unlimited Medicines', 'Basic Analytics', 'Up to 3 users'],
  },
  'pro-monthly': {
    id: 'pro-monthly',
    name: 'Pro Monthly',
    price: 2999,
    billingCycle: 'monthly',
    features: ['Unlimited Medicines', 'Advanced Analytics', 'Priority Support', 'Up to 10 users'],
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

export const PROTECTED_FEATURES = {
  premium: ['Advanced Analytics', 'Custom Roles', 'Multi-store Sync'],
};
