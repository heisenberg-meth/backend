import prisma from '../../../config/prisma.js';

class PrescriptionRepository {
  async createPrescription(data, tx) {
    const client = tx || prisma;
    return client.prescription.create({
      data: {
        tenantId: data.tenantId,
        patientId: data.patientId,
        doctorName: data.doctorName,
        prescriptionDate: new Date(data.prescriptionDate),
        notes: data.notes,
        prescriptionFileUrl: data.prescriptionFileUrl,
        createdBy: data.createdBy,
        items: {
          create: data.items.map((item) => ({
            medicineId: item.medicineId,
            dosage: item.dosage,
            durationDays: item.durationDays,
            instructions: item.instructions,
          })),
        },
      },
      include: {
        items: { include: { medicine: true } },
        patient: true,
      },
    });
  }

  async findByCustomerId(patientId, tenantId) {
    return prisma.prescription.findMany({
      where: { patientId, tenantId },
      include: {
        items: { include: { medicine: true } },
      },
      orderBy: { prescriptionDate: 'desc' },
    });
  }

  async findById(id, tenantId) {
    return prisma.prescription.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { medicine: true } },
        patient: true,
      },
    });
  }
}

export default new PrescriptionRepository();
