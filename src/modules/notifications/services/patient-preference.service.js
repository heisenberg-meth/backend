import prisma from '../../../config/prisma.js';

class PatientCommunicationPreferenceService {
  async checkPatientConsent(patientId, channel) {
    if (!patientId) return { allowed: true };

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { allowSms: true, allowWhatsApp: true, allowEmail: true },
    });

    if (!patient) return { allowed: false, reason: 'Patient not found' };

    const channelField = {
      SMS: 'allowSms',
      WHATSAPP: 'allowWhatsApp',
      EMAIL: 'allowEmail',
    };

    const field = channelField[channel];
    if (!field) return { allowed: true };

    if (!patient[field]) {
      return { allowed: false, reason: `Patient has opted out of ${channel} notifications` };
    }

    return { allowed: true };
  }

  async updatePatientConsent(patientId, preferences) {
    const data = {};
    if (preferences.allowSms !== undefined) data.allowSms = preferences.allowSms;
    if (preferences.allowWhatsApp !== undefined) data.allowWhatsApp = preferences.allowWhatsApp;
    if (preferences.allowEmail !== undefined) data.allowEmail = preferences.allowEmail;

    if (Object.keys(data).length === 0) throw new Error('No valid preference fields provided');

    return prisma.patient.update({
      where: { id: patientId },
      data,
      select: { id: true, fullName: true, allowSms: true, allowWhatsApp: true, allowEmail: true },
    });
  }
}

export default new PatientCommunicationPreferenceService();
