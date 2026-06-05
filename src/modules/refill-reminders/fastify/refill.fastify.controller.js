import refillService from '../services/refill.service.js';

class RefillFastifyController {
  async sendManualReminder(request, reply) {
    const { id } = request.params;
    const { medicineId, channel } = request.body;

    const refill = await refillService.predictRefill(id, medicineId, request.tenantId);
    if (!refill) {
      return reply
        .code(404)
        .send({ success: false, message: 'No refill prediction found for this medicine' });
    }

    const refillWithPatient = await refillService.getUpcomingRefills(request.tenantId);
    const specificRefill = refillWithPatient.find(
      (r) => r.patientId === id && r.medicineId === medicineId,
    );

    await refillService.sendReminder(specificRefill || refill, channel || 'SMS');
    return reply.send({ success: true, message: 'Reminder sent successfully' });
  }

  async getAdherence(request, reply) {
    const summary = await refillService.getAdherenceSummary(request.params.id, request.tenantId);
    return reply.send({ success: true, data: summary });
  }

  async getReminderHistory(request, reply) {
    const history = await refillService.getReminderHistory(request.params.id, request.tenantId);
    return reply.send({ success: true, data: history });
  }

  async getUpcomingRefills(request, reply) {
    const refills = await refillService.getUpcomingRefills(request.tenantId);
    return reply.send({ success: true, data: refills });
  }
}

export default new RefillFastifyController();
