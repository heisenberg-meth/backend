import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class VerificationService {
  async verifyQR(payload, tenantId) {
    logger.info(`[Verification] Verifying QR payload: ${JSON.stringify(payload)}`);

    let decoded;
    try {
      decoded = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch (error) {
      logger.error(error);
      throw new Error('Invalid QR payload format. Expected JSON.');
    }

    const { medicineId, batchId, expiry, manufacturer } = decoded;

    if (!medicineId || !batchId) {
      throw new Error('Incomplete QR payload. Medicine ID and Batch ID are required.');
    }

    const batch = await prisma.inventoryBatch.findFirst({
      where: {
        id: batchId,
        medicineId: medicineId,
        tenantId,
      },
      include: {
        medicine: { include: { manufacturer: true } },
      },
    });

    if (!batch) {
      return {
        valid: false,
        reason: 'Batch not found or counterfeit.',
        expired: false,
        batchStatus: 'UNKNOWN',
      };
    }

    if (manufacturer && batch.medicine.manufacturer?.name !== manufacturer) {
      return {
        valid: false,
        reason: 'Manufacturer mismatch. Potential counterfeit.',
        expired: false,
        batchStatus: batch.status,
      };
    }

    if (batch.recalled || batch.status === 'RECALLED') {
      return {
        valid: false,
        reason: 'This batch has been RECALLED. Do not consume.',
        expired: false,
        batchStatus: 'RECALLED',
      };
    }

    const now = new Date();
    const expiryDate = new Date(batch.expiryDate);
    const isExpired = expiryDate < now;

    if (expiry) {
      const payloadExpiry = new Date(expiry);
      if (Math.abs(payloadExpiry - expiryDate) > 86400000) {
        return {
          valid: false,
          reason: 'Expiry date tampering detected.',
          expired: isExpired,
          batchStatus: batch.status,
        };
      }
    }

    if (isExpired) {
      return {
        valid: true,
        reason: 'Batch is authentic but EXPIRED.',
        expired: true,
        batchStatus: batch.status,
      };
    }

    return {
      valid: true,
      reason: 'Authentic and valid.',
      expired: false,
      batchStatus: batch.status,
      details: {
        medicineName: batch.medicine.name,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
      },
    };
  }
}

export default new VerificationService();
