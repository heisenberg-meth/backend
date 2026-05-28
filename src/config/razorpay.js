import Razorpay from 'razorpay';
import logger from '../shared/utils/logger.js';
import { getConfig } from './payment.config.js';

let instance = null;

function getRazorpay() {
  if (instance) return instance;

  const config = getConfig();

  if (!config.keyId || !config.keySecret) {
    const error = 'Razorpay not configured: missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET';
    logger.error(`[RAZORPAY] ${error}`);
    throw new Error(error);
  }

  instance = new Razorpay({
    key_id: config.keyId,
    key_secret: config.keySecret,
  });

  logger.info(`[RAZORPAY] Initialized in ${config.environment} mode (${config.keyMode})`);
  return instance;
}

async function healthCheck() {
  try {
    const razorpay = getRazorpay();
    await razorpay.payments.all({ count: 1 });
    return { status: 'healthy', mode: getConfig().keyMode };
  } catch (error) {
    const isAuthError = error.statusCode === 401 || error.message?.includes('Unauthorized');
    return {
      status: isAuthError ? 'unauthorized' : 'unhealthy',
      error: error.message,
      mode: getConfig().keyMode,
    };
  }
}

function resetInstance() {
  instance = null;
}

// Lazy export — do NOT auto-initialize on import
const razorpay = new Proxy({}, {
  get(target, prop) {
    const client = getRazorpay();
    const value = client[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});

export { getRazorpay, healthCheck, resetInstance };
export default razorpay;
