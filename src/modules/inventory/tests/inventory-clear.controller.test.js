import { jest, describe, beforeEach, afterEach, it, expect } from '@jest/globals';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const inventoryClearServicePath = path.resolve(__dirname, '../service/inventory-clear.service.js');
const inventoryClearControllerPath = path.resolve(
  __dirname,
  '../controller/inventory-clear.controller.js',
);

const mockInventoryClearService = {
  getClearSummary: jest.fn(),
  clearBranchInventory: jest.fn(),
};

jest.unstable_mockModule(inventoryClearServicePath, () => ({
  default: mockInventoryClearService,
}));

const { default: inventoryClearController } = await import(inventoryClearControllerPath);

describe('InventoryClearController', () => {
  let mockRequest;
  let mockReply;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      tenantId: 'tenant-123',
      branchId: 'branch-123',
      user: { id: 'user-123' },
      query: {},
      log: { error: jest.fn() },
    };
    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getClearSummary', () => {
    it('returns summary for current branch', async () => {
      mockInventoryClearService.getClearSummary.mockResolvedValue({
        batchCount: 25,
        totalUnits: 1500,
        branchName: 'Main Store',
      });

      await inventoryClearController.getClearSummary(mockRequest, mockReply);

      expect(mockInventoryClearService.getClearSummary).toHaveBeenCalledWith(
        'tenant-123',
        'branch-123',
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            batchCount: 25,
            totalUnits: 1500,
            branchName: 'Main Store',
          },
        }),
      );
    });

    it('handles service errors with 500 status', async () => {
      mockInventoryClearService.getClearSummary.mockRejectedValue(new Error('DB failure'));

      await inventoryClearController.getClearSummary(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        }),
      );
    });
  });

  describe('clearInventory', () => {
    it('successfully clears inventory and returns 200 with summary', async () => {
      mockInventoryClearService.clearBranchInventory.mockResolvedValue({
        success: true,
        message: 'Inventory cleared successfully',
        summary: {
          batchesCleared: 25,
          unitsCleared: 1500,
        },
      });

      await inventoryClearController.clearInventory(mockRequest, mockReply);

      expect(mockInventoryClearService.clearBranchInventory).toHaveBeenCalledWith(
        'tenant-123',
        'branch-123',
        'user-123',
      );
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          summary: {
            batchesCleared: 25,
            unitsCleared: 1500,
          },
        }),
      );
    });

    it('handles concurrency conflicts with 409 status', async () => {
      const conflictError = new Error('Operation in progress');
      conflictError.statusCode = 409;
      conflictError.errorCode = 'OPERATION_IN_PROGRESS';
      mockInventoryClearService.clearBranchInventory.mockRejectedValue(conflictError);

      await inventoryClearController.clearInventory(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Operation in progress',
        }),
      );
    });

    it('handles unexpected errors with 500 status', async () => {
      mockInventoryClearService.clearBranchInventory.mockRejectedValue(
        new Error('Unexpected database error'),
      );

      await inventoryClearController.clearInventory(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Unable to clear inventory',
        }),
      );
    });
  });
});
