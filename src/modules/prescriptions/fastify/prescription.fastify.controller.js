import prescriptionService from '../services/prescription.service.js';
import verificationService from '../services/verification.service.js';
import dispensingService from '../services/dispensing.service.js';
import uploadService from '../services/upload.service.js';
import prescriptionRepository from '../repositories/prescription.repository.js';

class PrescriptionFastifyController {
  async getPrescriptions(request, reply) {
    try {
      const prescriptions = await prescriptionRepository.findPrescriptions(request.tenantId, request.query);
      return reply.send({ success: true, data: prescriptions });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async createPrescription(request, reply) {
    try {
      const prescription = await prescriptionService.createPrescription(
        request.tenantId,
        request.body,
        request.user?.id,
      );
      return reply.code(201).send({ success: true, data: prescription });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getPrescriptionById(request, reply) {
    try {
      const prescription = await prescriptionRepository.findPrescriptionById(request.params.id);
      if (!prescription) {
        return reply.code(404).send({ success: false, message: 'Prescription not found' });
      }
      if (prescription.prescriptionFileUrl && !prescription.prescriptionFileUrl.startsWith('http')) {
        prescription.prescriptionFileUrl = await uploadService.getSignedUrl(prescription.prescriptionFileUrl);
      }
      return reply.send({ success: true, data: prescription });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async verifyPrescription(request, reply) {
    try {
      const result = await verificationService.verifyPrescription(
        request.tenantId, request.params.id, request.user?.id,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async rejectPrescription(request, reply) {
    try {
      const result = await verificationService.rejectPrescription(
        request.tenantId, request.params.id, request.user?.id, request.body.reason,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getCustomerPrescriptions(request, reply) {
    try {
      const prescriptions = await prescriptionRepository.findPrescriptionsByPatient(
        request.params.patientId, request.tenantId, request.query,
      );
      return reply.send({ success: true, data: prescriptions });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async convertToInvoice(request, reply) {
    try {
      const result = await prescriptionService.convertToInvoice(
        request.params.id, request.user?.id,
      );
      return reply.code(201).send({ success: true, data: result });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getDispensingHistory(request, reply) {
    try {
      const history = await dispensingService.getDispensingHistory(request.params.id);
      return reply.send({ success: true, data: history });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getDoctorValidation(request, reply) {
    try {
      const prescription = await prescriptionRepository.findPrescriptionById(request.params.id);
      if (!prescription) {
        return reply.code(404).send({ success: false, message: 'Prescription not found' });
      }
      return reply.send({ success: true, data: { doctorId: prescription.doctorId, doctorName: prescription.doctor?.doctorName } });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new PrescriptionFastifyController();
