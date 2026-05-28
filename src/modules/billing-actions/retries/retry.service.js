import logger from '../../../shared/utils/logger.js';

class RetryService {
  constructor() {
    this.maxRetries = {
      PDF_GENERATION: 3,
      EMAIL_DELIVERY: 5,
      WHATSAPP_DELIVERY: 5,
      PRINT_JOB: 3,
    };

    this.backoffDelays = {
      PDF_GENERATION: [1000, 5000, 15000],
      EMAIL_DELIVERY: [5000, 15000, 30000, 60000, 120000],
      WHATSAPP_DELIVERY: [5000, 15000, 30000, 60000, 120000],
      PRINT_JOB: [2000, 10000, 30000],
    };
  }

  getMaxRetries(jobType) {
    return this.maxRetries[jobType] || 3;
  }

  getBackoffDelay(jobType, attempt) {
    const delays = this.backoffDelays[jobType] || [1000, 5000, 10000];
    return delays[Math.min(attempt, delays.length - 1)];
  }

  shouldRetry(jobType, attempt, error) {
    const maxRetries = this.getMaxRetries(jobType);

    if (attempt >= maxRetries) {
      logger.warn(`[Retry] Max retries (${maxRetries}) reached for ${jobType}`);
      return false;
    }

    if (this.isNonRetryable(error)) {
      logger.warn(`[Retry] Non-retryable error for ${jobType}: ${error.message}`);
      return false;
    }

    return true;
  }

  isNonRetryable(error) {
    const message = (error.message || '').toLowerCase();

    const nonRetryablePatterns = [
      'not found',
      'invalid',
      'unauthorized',
      'forbidden',
      'not configured',
      'template not approved',
      'opt-in required',
      'already cancelled',
      'permission denied',
    ];

    return nonRetryablePatterns.some((pattern) => message.includes(pattern));
  }

  calculateBackoff(jobType, attempt) {
    const delay = this.getBackoffDelay(jobType, attempt);
    const jitter = Math.random() * 0.3 * delay;
    return Math.floor(delay + jitter);
  }
}

export default new RetryService();
