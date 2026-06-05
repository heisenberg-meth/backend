import { Worker } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import logger from '../../../shared/utils/logger.js';
import prescriptionSyncService from '../services/prescription-sync.service.js';

const isTest = process.env.NODE_ENV === 'test';

const hospitalSyncWorker = isTest
  ? null
  : new Worker(
      'hospital-sync-queue',
      async (job) => {
        if (job.name === 'SYNC_PRESCRIPTION') {
          const { tenantId, sourceSystem, externalMedicationRequest } = job.data;
          logger.info({ tenantId }, '[HOSPITAL_SYNC_WORKER] Processing prescription sync');

          await prescriptionSyncService.syncFromExternal(
            tenantId,
            externalMedicationRequest,
            sourceSystem,
          );
        }
      },
      { connection: getBullRedis() },
    );

if (hospitalSyncWorker) {
  hospitalSyncWorker.on('failed', (job, err) => {
    logger.error({ job, err }, '[HOSPITAL_SYNC_WORKER] Job failed');
  });
}

export default hospitalSyncWorker;
