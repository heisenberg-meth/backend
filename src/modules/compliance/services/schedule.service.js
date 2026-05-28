import prisma from '../../../config/prisma.js';

class ScheduleService {
  async canDispense(medicineId, prescriptionId, pharmacistId) {
    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
    });

    if (!medicine || !medicine.scheduleType || medicine.scheduleType === 'NONE') {
      return { allowed: true };
    }

    if (medicine.scheduleType === 'X') {
      if (!pharmacistId) {
        return { allowed: false, reason: 'Schedule X medicine requires pharmacist authorization.' };
      }
      const user = await prisma.user.findUnique({ where: { id: pharmacistId } });
      if (!user || !user.pharmacistRegistrationNumber) {
        return { allowed: false, reason: 'Unauthorized user. Pharmacist registration required.' };
      }
    }

    return { allowed: true };
  }
}

export default new ScheduleService();
