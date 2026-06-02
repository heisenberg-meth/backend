export const DISPOSABLE_DOMAINS = [
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'sharklasers.com',
  'mailinator.com',
];
export const REGISTRATION_RATE_LIMIT = 3;
export const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const OTP_EXPIRY_MS = 10 * 60 * 1000;
export const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
export const RESET_TOKEN_EXPIRY_MS = 5 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;
export const USER_ROLES = { OWNER: 'owner', STAFF: 'staff' };
export const SUBSCRIPTION_STATUS = {
  UNVERIFIED: 'unverified',
  TRIAL: 'trial',
  ACTIVE: 'active',
  EXPIRED: 'expired',
};
