import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import eventBus from '../../../shared/services/eventbus.service.js';

class CleanupJobsService {
  /**
   * Periodic production operational job: Purges expired forensics and stale records.
   */
  async runPeriodicCleanup() {
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    logger.info('Starting Auth Subsystem periodic operational maintenance job');

    const [deletedHistory, deletedRecovery] = await Promise.all([
      prisma.loginHistory.deleteMany({
        where: { recordedAt: { lt: ninetyDaysAgo } },
      }),
      prisma.accountRecoveryRequest.deleteMany({
        where: {
          status: { in: ['APPROVED', 'REJECTED'] },
          resolvedAt: { lt: thirtyDaysAgo },
        },
      }),
    ]);

    const summary = {
      timestamp: now.toISOString(),
      purgedLoginHistoryRecords: deletedHistory.count,
      purgedResolvedRecoveryRequests: deletedRecovery.count,
    };

    logger.info(summary, 'Periodic operational maintenance completed');
    eventBus.publish('AuthMaintenanceJobCompleted', summary);

    return summary;
  }
}

export default new CleanupJobsService();
