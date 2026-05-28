import { jest , describe, beforeEach, it, expect } from '@jest/globals';

import MovementService from '../../src/modules/stock/services/movement.service.js';

describe('MovementService Idempotency', () => {
  let tx;
  
  beforeEach(() => {
    tx = {
      stockMovement: {
        findUnique: jest.fn(),
        create: jest.fn()
      },
      inventoryBatch: {
        update: jest.fn()
      },
      inventory: {
        update: jest.fn().mockResolvedValue({})
      }
    };
  });

  const baseData = {
    tenantId: 'tenant-1',
    medicineId: 'med-1',
    batchId: 'batch-1',
    quantity: 10,
    movementType: 'SALE'
  };

  it('Test 1: Record movement with new idempotencyKey -> Success, creates record', async () => {
    tx.stockMovement.findUnique.mockResolvedValue(null);
    tx.inventoryBatch.update.mockResolvedValue({ quantity: 100 });
    tx.stockMovement.create.mockResolvedValue({ id: 'mov-1' });

    const result = await MovementService.recordMovement(tx, {
      ...baseData,
      idempotencyKey: 'key-1'
    });

    expect(tx.stockMovement.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'key-1' } });
    expect(tx.inventoryBatch.update).toHaveBeenCalled();
    expect(tx.inventory.update).toHaveBeenCalled();
    expect(tx.stockMovement.create).toHaveBeenCalled();
    expect(result.id).toBe('mov-1');
  });

  it('Test 2: Record movement with same idempotencyKey -> Returns existing record, does NOT update batch quantity again', async () => {
    tx.stockMovement.findUnique.mockResolvedValue({ id: 'mov-existing' });

    const result = await MovementService.recordMovement(tx, {
      ...baseData,
      idempotencyKey: 'key-existing'
    });

    expect(tx.stockMovement.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'key-existing' } });
    expect(tx.inventoryBatch.update).not.toHaveBeenCalled();
    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(result.id).toBe('mov-existing');
  });

  it('Test 3: Record movement without idempotencyKey -> Generate one', async () => {
    tx.stockMovement.findUnique.mockResolvedValue(null);
    tx.inventoryBatch.update.mockResolvedValue({ quantity: 100 });
    tx.stockMovement.create.mockImplementation((data) => Promise.resolve({ id: 'mov-new', ...data.data }));

    const result = await MovementService.recordMovement(tx, baseData);

    expect(tx.inventoryBatch.update).toHaveBeenCalled();
    expect(tx.stockMovement.create).toHaveBeenCalled();
    expect(result.idempotencyKey).toBeDefined();
  });
});
