import logger from '../shared/utils/logger.js';

const REQUIRED_ENV_KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];
const PAYMENT_ENV_KEYS = ['RAZORPAY_WEBHOOK_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'];

const ENV_PATTERNS = {
  RAZORPAY_KEY_ID: /^rzp_(live|test)_[A-Za-z0-9]{14,}$/,
  RAZORPAY_KEY_SECRET: /^[A-Za-z0-9]{10,}$/,
};

const sanitizeEnv = (val) => (val ? String(val).trim().replace(/^["']|["']$/g, '').replace(/[\r\n]/g, '') : undefined);

let validated = false;
let validationErrors = [];

function validateEnvironment() {
  validationErrors = [];
  const nodeEnv = process.env.NODE_ENV || 'development';

  for (const key of REQUIRED_ENV_KEYS) {
    const val = sanitizeEnv(process.env[key]);
    if (!val) {
      validationErrors.push(`Missing required env: ${key}`);
    }
  }

  const keyId = sanitizeEnv(process.env.RAZORPAY_KEY_ID);
  if (keyId) {
    const pattern = ENV_PATTERNS.RAZORPAY_KEY_ID;
    if (!pattern.test(keyId)) {
      validationErrors.push('RAZORPAY_KEY_ID has invalid format (expected rzp_test_xxx or rzp_live_xxx)');
    }

    if (nodeEnv === 'production' && keyId.startsWith('rzp_test_')) {
      validationErrors.push('PRODUCTION ENV with TEST Razorpay key! Use live keys.');
    }

    if (nodeEnv !== 'production' && keyId.startsWith('rzp_live_')) {
      validationErrors.push('LIVE Razorpay key in non-production environment! Use rzp_test_ keys for development.');
    }

    if (nodeEnv === 'test' && keyId.startsWith('rzp_live_')) {
      throw new Error('[PAYMENT_CONFIG] LIVE Razorpay keys are FORBIDDEN in test environment. Use rzp_test_ keys.');
    }
  }

  if (validationErrors.length > 0) {
    for (const err of validationErrors) {
      logger.error(`[PAYMENT_CONFIG] ${err}`);
    }
    return false;
  }

  validated = true;
  return true;
}

function getConfig() {
  const keyId = sanitizeEnv(process.env.RAZORPAY_KEY_ID);
  const keySecret = sanitizeEnv(process.env.RAZORPAY_KEY_SECRET);
  const webhookSecret = sanitizeEnv(process.env.RAZORPAY_WEBHOOK_SECRET);
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'test' && keyId?.startsWith('rzp_live_')) {
    throw new Error('[PAYMENT_CONFIG] LIVE Razorpay keys are FORBIDDEN in test environment. Use rzp_test_ keys.');
  }

  return {
    keyId,
    keySecret,
    webhookSecret,
    environment: nodeEnv,
    isProduction: nodeEnv === 'production',
    keyMode: keyId?.startsWith('rzp_live_') ? 'LIVE' : 'TEST',
    retryConfig: {
      maxRetries: parseInt(process.env.PAYMENT_MAX_RETRIES || '3'),
      initialDelayMs: parseInt(process.env.PAYMENT_RETRY_DELAY_MS || '1000'),
      maxDelayMs: parseInt(process.env.PAYMENT_MAX_RETRY_DELAY_MS || '30000'),
      backoffFactor: parseFloat(process.env.PAYMENT_RETRY_BACKOFF || '2'),
    },
    webhookConfig: {
      signatureHeader: 'x-razorpay-signature',
      timeout: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '5000'),
    },
    idempotencyTtlMs: parseInt(process.env.IDEMPOTENCY_TTL_MS || '86400000'),
    lockTtlMs: parseInt(process.env.LOCK_TTL_MS || '30000'),
    recoveryIntervalMs: parseInt(process.env.RECOVERY_INTERVAL_MS || '60000'),
    reconciliationIntervalMs: parseInt(process.env.RECONCILIATION_INTERVAL_MS || '300000'),
  };
}

function getValidationErrors() {
  return [...validationErrors];
}

function isConfigured() {
  return validated && validationErrors.length === 0;
}

export {
  validateEnvironment,
  getConfig,
  getValidationErrors,
  isConfigured,
  PAYMENT_ENV_KEYS,
};

export default { validateEnvironment, getConfig, getValidationErrors, isConfigured };
