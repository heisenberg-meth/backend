import prisma from '../../../../config/prisma.js';
import logger from '../../../../shared/utils/logger.js';

class InpatientService {
  /**
   * Record medication administration for an inpatient
   */
  async recordAdministration(tenantId, data) {
    const { admissionId, medicineId, quantity, pharmacistId } = data;

    // 1. Log administration
    const adminRecord = await prisma.inpatientMedicationUsage.create({
      data: {
        admissionId,
        medicineId,
        quantity,
        administeredById: pharmacistId,
        administeredAt: new Date(),
      },
    });

    logger.info({ adminRecordId: adminRecord.id }, '[INPATIENT_SERVICE] Medication administered');
    return adminRecord;
  }
}

export default new InpatientService();
