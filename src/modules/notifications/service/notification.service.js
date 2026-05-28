import logger from '../../../shared/utils/logger.js';

class NotificationService {
  async runExpiryCheck() {
    logger.info('Running daily expiry check...');
    // Logic here
  }
}

export default new NotificationService();
