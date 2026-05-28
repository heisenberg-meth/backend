import prescriptionRepository from '../repositories/prescription.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import { DOMAIN_EVENTS } from '../../../shared/constants/events.js';
import { prescriptionStateMachine } from '../../../shared/constants/state-machines.js';
import { emitLocalEvent } from '../../../shared/events/local-event-bus.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';

class VerificationService {
  async verifyPrescription(tenantId, prescriptionId, userId) {
    const prescription = await prescriptionRepository.findById(prescriptionId, tenantId);
    if (!prescription) throw new Error('Prescription not found');

    const nextStatus = prescriptionStateMachine.transition(prescription.verificationStatus, 'VERIFY');

    await prescriptionRepository.createVerification({
      prescriptionId,
      verifiedBy: userId,
      status: nextStatus,
    });

    const updated = await prescriptionRepository.updateStatus(prescriptionId, tenantId, nextStatus);

    // Emit events
    emitLocalEvent(DOMAIN_EVENTS.PRESCRIPTION_VERIFIED, { prescriptionId, tenantId });
    await emitEvent(DOMAIN_EVENTS.PRESCRIPTION_VERIFIED, { prescriptionId, tenantId });

    await auditService.log({
      tenantId,
      userId,
      action: 'VERIFY_PRESCRIPTION',
      target: prescriptionId,
      type: 'ACCESS',
    });

    return updated;
  }

  async rejectPrescription(tenantId, prescriptionId, userId, reason) {
    const prescription = await prescriptionRepository.findById(prescriptionId, tenantId);
    if (!prescription) throw new Error('Prescription not found');

    const nextStatus = prescriptionStateMachine.transition(prescription.verificationStatus, 'REJECT');

    await prescriptionRepository.createVerification({
      prescriptionId,
      verifiedBy: userId,
      status: nextStatus,
      rejectionReason: reason,
    });

    const updated = await prescriptionRepository.updateStatus(prescriptionId, tenantId, nextStatus);

    await auditService.log({
      tenantId,
      userId,
      action: 'REJECT_PRESCRIPTION',
      target: prescriptionId,
      type: 'ACCESS',
    });

    return updated;
  }
}

export default new VerificationService();
