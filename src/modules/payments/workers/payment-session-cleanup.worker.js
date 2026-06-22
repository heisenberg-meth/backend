import logger from '../../../shared/utils/logger.js';
import paymentSessionService from '../../subscriptions/payment-session.service.js';

const paymentSessionCleanupWorker = {
  handle: async () => {
    try {
      const cleanedCount = await paymentSessionService.cleanupExpiredSessions();
      logger.info(
        { cleanedCount },
        '[WORKER] Payment session cleanup completed',
      );
      return { success: true, cleanedCount };
    } catch (error) {
      logger.error(
        { error: error.message },
        '[WORKER] Payment session cleanup failed',
      );
      throw error;
    }
  },
};

export default paymentSessionCleanupWorker;
