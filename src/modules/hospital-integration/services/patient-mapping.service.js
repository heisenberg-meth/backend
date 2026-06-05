import prisma from '../../../config/prisma.js';

class PatientMappingService {
  async getOrCreateInternalPatient(externalId, tenantId, sourceSystem, patientDetails) {
    const mapping = await prisma.patientIdentityMap.findFirst({
      where: { externalPatientId: externalId, sourceSystem },
    });

    if (mapping) {
      return await prisma.patient.findUnique({ where: { id: mapping.internalPatientId } });
    }

    const newPatient = await prisma.patient.create({
      data: {
        tenantId,
        fullName: patientDetails.fullName,
        phone: patientDetails.phone,
        email: patientDetails.email,
      },
    });

    await prisma.patientIdentityMap.create({
      data: {
        externalPatientId: externalId,
        internalPatientId: newPatient.id,
        sourceSystem,
      },
    });

    return newPatient;
  }
}

export default new PatientMappingService();
