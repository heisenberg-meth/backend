import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';
import { mainQueue } from '../../../queue/index.js';

class PrescriptionUploadService {
  /**
   * Orchestrate prescription intake and OCR processing
   */
  async upload(tenantId, patientId, prescriptionUrl) {
    // 1. Create prescription record (PENDING)
    const prescription = await prisma.patientPrescription.create({
      data: {
        tenantId,
        patientId,
        prescriptionUrl,
        prescriptionStatus: 'UPLOADED',
      },
    });

    // 2. Queue for OCR extraction pipeline
    await mainQueue.add(
      'process-prescription-ocr',
      {
        prescriptionId: prescription.id,
        tenantId,
        prescriptionUrl,
      },
      {
        removeOnComplete: true,
      },
    );

    logger.info(
      { prescriptionId: prescription.id },
      '[CUSTOMER_PLATFORM] Prescription uploaded and queued for processing',
    );
    return prescription;
  }
}

export default new PrescriptionUploadService();
