import doctorService from '../services/doctor.service.js';

class DoctorFastifyController {
  async getDoctors(request, reply) {
    try {
      const doctors = await doctorService.getDoctors(request.tenantId, request.query.search);
      return reply.send(doctors);
    } catch (error) {
      return reply.code(500).send({ message: error.message });
    }
  }

  async createDoctor(request, reply) {
    try {
      const doctor = await doctorService.createDoctor(request.tenantId, request.body);
      return reply.code(201).send(doctor);
    } catch (error) {
      return reply.code(400).send({ message: error.message });
    }
  }
}

export default new DoctorFastifyController();
