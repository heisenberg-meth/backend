import prisma from '../../../config/prisma.js';

class ReminderService {
  /**
   * Schedule medication reminders for a patient
   */
  async scheduleReminders(tenantId, patientId, medicineId, scheduleData) {
    const { reminderTimes, frequency } = scheduleData;
    
    // Create individual reminders
    const reminders = reminderTimes.map((time) => ({
      tenantId,
      patientId,
      medicineId,
      reminderTime: time,
      frequency,
    }));

    return await prisma.medicationReminder.createMany({
      data: reminders
    });
  }
}

export default new ReminderService();
