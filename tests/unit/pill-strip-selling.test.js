import { describe, it, expect, jest } from '@jest/globals';
import invoiceEngine from '../../src/modules/billing/invoice-engine/invoice.engine.js';
import refundInventoryService from '../../src/modules/refunds/services/refund-inventory.service.js';
import prisma from '../../src/config/prisma.js';
import movementService from '../../src/modules/stock/service/movement.service.js';

describe('POS Pill / Strip Selling & Stock Deduction Unit Tests', () => {
  describe('Stock Deduction in Base Units', () => {
    it('should deduct exactly item.quantity when sellingUnit is PILL', async () => {
      const mockBatches = [
        { id: 'batch-1', quantity: 20, availableQuantity: 20, expiryDate: new Date('2028-01-01') },
      ];
      jest.spyOn(invoiceEngine, '_getAvailableBatches').mockResolvedValue(mockBatches);
      const recordMovementSpy = jest.spyOn(movementService, 'recordMovement').mockResolvedValue({});

      const item = {
        medicineId: 'med-1',
        batchId: 'batch-1',
        quantity: 3,
        sellingUnit: 'PILL',
        stripSize: 10,
        unitPrice: 22,
      };
      const invoice = {
        id: 'inv-1',
        invoiceNumber: 'INV-2026-000001',
        branchId: 'branch-1',
      };

      const result = await invoiceEngine._processItemDeduction(
        'tenant-1',
        invoice,
        item,
        'user-1',
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(3); // 3 pills deducted
      expect(recordMovementSpy).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          quantity: -3,
          movementType: 'SALE',
        }),
        'user-1',
        null,
      );

      invoiceEngine._getAvailableBatches.mockRestore();
      recordMovementSpy.mockRestore();
    });

    it('should deduct quantity * stripSize when sellingUnit is STRIP', async () => {
      const mockBatches = [
        { id: 'batch-1', quantity: 30, availableQuantity: 30, expiryDate: new Date('2028-01-01') },
      ];
      jest.spyOn(invoiceEngine, '_getAvailableBatches').mockResolvedValue(mockBatches);
      const recordMovementSpy = jest.spyOn(movementService, 'recordMovement').mockResolvedValue({});

      const item = {
        medicineId: 'med-1',
        batchId: 'batch-1',
        quantity: 2,
        sellingUnit: 'STRIP',
        stripSize: 10,
        unitPrice: 220,
      };
      const invoice = {
        id: 'inv-2',
        invoiceNumber: 'INV-2026-000002',
        branchId: 'branch-1',
      };

      const result = await invoiceEngine._processItemDeduction(
        'tenant-1',
        invoice,
        item,
        'user-1',
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(20); // 2 * 10 = 20 pills deducted
      expect(recordMovementSpy).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          quantity: -20,
          movementType: 'SALE',
        }),
        'user-1',
        null,
      );

      invoiceEngine._getAvailableBatches.mockRestore();
      recordMovementSpy.mockRestore();
    });

    it('should correctly handle custom stripSize (e.g. 15 pills/strip)', async () => {
      const mockBatches = [
        { id: 'batch-1', quantity: 50, availableQuantity: 50, expiryDate: new Date('2028-01-01') },
      ];
      jest.spyOn(invoiceEngine, '_getAvailableBatches').mockResolvedValue(mockBatches);
      const recordMovementSpy = jest.spyOn(movementService, 'recordMovement').mockResolvedValue({});

      const item = {
        medicineId: 'med-2',
        batchId: 'batch-1',
        quantity: 3,
        sellingUnit: 'STRIP',
        stripSize: 15, // Custom pack size
        unitPrice: 300,
      };
      const invoice = {
        id: 'inv-3',
        invoiceNumber: 'INV-2026-000003',
        branchId: 'branch-1',
      };

      const result = await invoiceEngine._processItemDeduction(
        'tenant-1',
        invoice,
        item,
        'user-1',
        null,
      );

      expect(result).toHaveLength(1);
      expect(result[0].quantity).toBe(45); // 3 * 15 = 45 pills deducted
      expect(recordMovementSpy).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          quantity: -45,
        }),
        'user-1',
        null,
      );

      invoiceEngine._getAvailableBatches.mockRestore();
      recordMovementSpy.mockRestore();
    });

    it('should reject sale when required strip stock exceeds available pills', async () => {
      const mockBatches = [
        { id: 'batch-1', quantity: 15, availableQuantity: 15, expiryDate: new Date('2028-01-01') },
      ];
      jest.spyOn(invoiceEngine, '_getAvailableBatches').mockResolvedValue(mockBatches);

      const item = {
        medicineId: 'med-1',
        batchId: 'batch-1',
        quantity: 2, // 2 * 10 = 20 pills needed, but only 15 available
        sellingUnit: 'STRIP',
        stripSize: 10,
        unitPrice: 220,
      };
      const invoice = {
        id: 'inv-4',
        invoiceNumber: 'INV-2026-000004',
        branchId: 'branch-1',
      };

      await expect(
        invoiceEngine._processItemDeduction('tenant-1', invoice, item, 'user-1', null),
      ).rejects.toThrow(/insufficient stock/i);

      invoiceEngine._getAvailableBatches.mockRestore();
    });
  });

  describe('Restocking on Refund & Return', () => {
    it('should restore quantity * stripSize when returning a STRIP', async () => {
      const mockBatch = { id: 'batch-1', branchId: 'branch-1' };
      const batchFindSpy = jest
        .spyOn(prisma.inventoryBatch, 'findUnique')
        .mockResolvedValue(mockBatch);
      const batchUpdateSpy = jest.spyOn(prisma.inventoryBatch, 'update').mockResolvedValue({});
      const invUpdateSpy = jest.spyOn(prisma.inventory, 'update').mockResolvedValue({});
      const stockMovementSpy = jest.spyOn(prisma.stockMovement, 'create').mockResolvedValue({});
      const returnItemUpdateSpy = jest.spyOn(prisma.returnItem, 'update').mockResolvedValue({});

      // Mock the invoice item with STRIP selling unit and stripSize 10
      const invItemFindSpy = jest.spyOn(prisma.invoiceItem, 'findUnique').mockResolvedValue({
        id: 'inv-item-1',
        sellingUnit: 'STRIP',
        stripSize: 10,
      });

      await refundInventoryService.restoreStock(
        'tenant-1',
        'ret-1',
        [
          {
            batchId: 'batch-1',
            medicineId: 'med-1',
            invoiceItemId: 'inv-item-1',
            returnedQuantity: 1, // 1 strip returned
          },
        ],
        prisma,
      );

      // Verify that 10 pills were restored
      expect(batchUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'batch-1' },
          data: expect.objectContaining({
            quantity: { increment: 10 },
            availableQuantity: { increment: 10 },
          }),
        }),
      );

      expect(invUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            currentStock: { increment: 10 },
          }),
        }),
      );

      batchFindSpy.mockRestore();
      batchUpdateSpy.mockRestore();
      invUpdateSpy.mockRestore();
      stockMovementSpy.mockRestore();
      returnItemUpdateSpy.mockRestore();
      invItemFindSpy.mockRestore();
    });

    it('should restore exact quantity when returning a PILL', async () => {
      const mockBatch = { id: 'batch-1', branchId: 'branch-1' };
      const batchFindSpy = jest
        .spyOn(prisma.inventoryBatch, 'findUnique')
        .mockResolvedValue(mockBatch);
      const batchUpdateSpy = jest.spyOn(prisma.inventoryBatch, 'update').mockResolvedValue({});
      const invUpdateSpy = jest.spyOn(prisma.inventory, 'update').mockResolvedValue({});
      const stockMovementSpy = jest.spyOn(prisma.stockMovement, 'create').mockResolvedValue({});
      const returnItemUpdateSpy = jest.spyOn(prisma.returnItem, 'update').mockResolvedValue({});

      const invItemFindSpy = jest.spyOn(prisma.invoiceItem, 'findUnique').mockResolvedValue({
        id: 'inv-item-2',
        sellingUnit: 'PILL',
        stripSize: 10,
      });

      await refundInventoryService.restoreStock(
        'tenant-1',
        'ret-2',
        [
          {
            batchId: 'batch-1',
            medicineId: 'med-1',
            invoiceItemId: 'inv-item-2',
            returnedQuantity: 4, // 4 pills returned
          },
        ],
        prisma,
      );

      // Verify that 4 pills were restored
      expect(batchUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'batch-1' },
          data: expect.objectContaining({
            quantity: { increment: 4 },
            availableQuantity: { increment: 4 },
          }),
        }),
      );

      batchFindSpy.mockRestore();
      batchUpdateSpy.mockRestore();
      invUpdateSpy.mockRestore();
      stockMovementSpy.mockRestore();
      returnItemUpdateSpy.mockRestore();
      invItemFindSpy.mockRestore();
    });
  });
});
