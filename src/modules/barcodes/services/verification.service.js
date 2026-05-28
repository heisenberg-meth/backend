import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class VerificationService {
  /**
   * Verifies the authenticity and validity of a scanned QR payload.
   * Typical payload: { "medicineId": "uuid", "batchId": "uuid", "expiry": "2027-01-01", "manufacturer": "ABC Pharma" }
   */
  async verifyQR(payload, tenantId) {
    logger.info(`[Verification] Verifying QR payload: ${JSON.stringify(payload)}`);
    
    let decoded;
    try {
      // In a real scenario, this might also include signature verification (JWT)
      decoded = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch (error) {
      logger.error(error);
      throw new Error('Invalid QR payload format. Expected JSON.');
    }

    const { medicineId, batchId, expiry, manufacturer } = decoded;

    if (!medicineId || !batchId) {
      throw new Error('Incomplete QR payload. Medicine ID and Batch ID are required.');
    }

    // 1. Fetch from DB to verify existence and authenticity
    const batch = await prisma.inventoryBatch.findFirst({
      where: {
        id: batchId,
        medicineId: medicineId,
        tenantId, // Ensure it belongs to the current tenant if applicable, or remove for global validation
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
        batchStatus: 'UNKNOWN'
      };
    }

    // 2. Validate Manufacturer
    if (manufacturer && batch.medicine.manufacturer?.name !== manufacturer) {
      return {
        valid: false,
        reason: 'Manufacturer mismatch. Potential counterfeit.',
        expired: false,
        batchStatus: batch.status
      };
    }

    // 3. Validate Recalls
    if (batch.recalled || batch.status === 'RECALLED') {
      return {
        valid: false,
        reason: 'This batch has been RECALLED. Do not consume.',
        expired: false,
        batchStatus: 'RECALLED'
      };
    }

    // 4. Validate Expiry
    const now = new Date();
    const expiryDate = new Date(batch.expiryDate);
    const isExpired = expiryDate < now;

    // Optional: Compare payload expiry with DB expiry for tampering check
    if (expiry) {
      const payloadExpiry = new Date(expiry);
      if (Math.abs(payloadExpiry - expiryDate) > 86400000) { // More than 1 day diff
         return {
            valid: false,
            reason: 'Expiry date tampering detected.',
            expired: isExpired,
            batchStatus: batch.status
         };
      }
    }

    if (isExpired) {
      return {
        valid: true, // It is authentic, but expired
        reason: 'Batch is authentic but EXPIRED.',
        expired: true,
        batchStatus: batch.status
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
        expiryDate: batch.expiryDate
      }
    };
  }
}

export default new VerificationService();
