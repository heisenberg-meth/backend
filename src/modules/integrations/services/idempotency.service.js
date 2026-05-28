import prisma from '../../../config/prisma.js';

class IdempotencyService {
  /**
   * Check if a key has already been processed
   */
  async isKeyProcessed(key) {
    const record = await prisma.idempotencyKey.findUnique({
      where: { idempotencyKey: key },
    });
    return !!record;
  }

  /**
   * Mark a key as processed
   */
  async markAsProcessed(key, responseSnapshot) {
    await prisma.idempotencyKey.create({
      data: {
        idempotencyKey: key,
        responseSnapshot,
      },
    });
  }
}

export default new IdempotencyService();
