import batchRepository from '../repositories/batch.repository.js';

class FEFOEngine {
  async selectBatches(tenantId, medicineId, requiredQty) {
    const batches = await batchRepository.findAll(tenantId, {
      medicineId,
      status: 'ACTIVE',
    });

    const now = new Date();
    const availableBatches = batches.filter((b) => b.quantity > 0 && b.expiryDate > now);

    const selection = [];
    let remaining = requiredQty;

    for (const batch of availableBatches) {
      if (remaining <= 0) break;

      const taken = Math.min(batch.quantity, remaining);
      selection.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantity: taken,
        expiryDate: batch.expiryDate,
      });

      remaining -= taken;
    }

    return {
      selection,
      fulfilled: remaining <= 0,
      remainingRequired: remaining,
    };
  }
}

export default new FEFOEngine();
