import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { emitEvent } from '../../../shared/events/erp-event-bus.js';

class InsuranceService {
  /**
   * Mock Insurance Verification Job
   */
  async verifyClaim(claimId, tenantId) {
    logger.info(`[INSURANCE] Verifying claim: ${claimId}`);
    
    const claim = await prisma.patientInsuranceClaim.findUnique({
      where: { id: claimId, tenantId }
    });

    if (!claim) return;

    await new Promise(resolve => setTimeout(resolve, 2000));

    const status = 'APPROVED';
    
    await prisma.patientInsuranceClaim.update({
      where: { id: claimId },
      data: { 
        status,
        notes: status === 'APPROVED' ? 'Claim verified by provider' : 'Provider rejected claim: Policy inactive'
      }
    });

    await emitEvent('INSURANCE_CLAIM_UPDATED', { claimId, tenantId, status });
    logger.info(`[INSURANCE] Claim ${claimId} status updated to ${status}`);
  }
}

export default new InsuranceService();
