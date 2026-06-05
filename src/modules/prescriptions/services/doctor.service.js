import prisma from '../../../config/prisma.js';
import prescriptionRepository from '../repositories/prescription.repository.js';

class DoctorService {
  async createDoctor(tenantId, data) {
    if (data.registrationNumber) {
      const existing = await prisma.doctor.findFirst({
        where: { registrationNumber: data.registrationNumber, tenantId },
      });
      if (existing)
        throw new Error(
          `Doctor with registration number ${data.registrationNumber} already exists`,
        );
    }

    return prescriptionRepository.createDoctor({
      ...data,
      tenantId,
    });
  }

  async getDoctors(tenantId, search) {
    return prescriptionRepository.findDoctors(tenantId, search);
  }
}

export default new DoctorService();
