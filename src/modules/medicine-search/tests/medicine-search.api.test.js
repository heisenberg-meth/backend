import { jest , describe, beforeEach, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const searchRepoPath = path.resolve(__dirname, '../repositories/medicine-search.repository.js');
const cachePath = path.resolve(__dirname, '../cache/medicine-search.cache.js');
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const erpEventBusPath = path.resolve(__dirname, '../../../shared/events/erp-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');

const mockPrisma = {
  medicine: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  medicineBarcode: {
    findFirst: jest.fn(),
  },
  inventoryBatch: {
    findMany: jest.fn(),
  },
  drugAlternative: {
    findMany: jest.fn(),
  },
  searchAnalytics: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockCache = {
  getBarcode: jest.fn(),
  setBarcode: jest.fn(),
  invalidateBarcode: jest.fn(),
  getSku: jest.fn(),
  setSku: jest.fn(),
  getAutocomplete: jest.fn(),
  setAutocomplete: jest.fn(),
  getSearch: jest.fn(),
  setSearch: jest.fn(),
  getPopularSearches: jest.fn(),
  setPopularSearches: jest.fn(),
  invalidateAll: jest.fn(),
};

const mockSearchRepository = {
  search: jest.fn(),
  autocomplete: jest.fn(),
  fuzzySearch: jest.fn(),
  findByBarcode: jest.fn(),
  findByBarcodeMapping: jest.fn(),
  findBySku: jest.fn(),
  findAlternatives: jest.fn(),
  getAvailability: jest.fn(),
  getPopularSearches: jest.fn(),
  getFailedSearches: jest.fn(),
  enrichWithInventory: jest.fn((med) => ({
    ...med,
    availableStock: 100,
    totalStock: 100,
  })),
};

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.unstable_mockModule(prismaPath, () => ({
  default: mockPrisma,
}));

jest.unstable_mockModule(searchRepoPath, () => ({
  default: mockSearchRepository,
}));

jest.unstable_mockModule(cachePath, () => ({
  default: mockCache,
}));

jest.unstable_mockModule(localEventBusPath, () => ({
  emitLocalEvent: jest.fn(), localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule(erpEventBusPath, () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: mockLogger,
}));

jest.unstable_mockModule('../../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    req.user = { id: 'user-1', role: 'ADMIN' };
    req.tenantId = 'tenant-1';
    next();
  },
}));

jest.unstable_mockModule('../../../middleware/role.middleware.js', () => ({
  authorize: () => (req, res, next) => next(),
}));

jest.unstable_mockModule('../../../middleware/validate.middleware.js', () => ({
  default: () => (req, res, next) => next(),
}));

const { default: medicineSearchRoutes } = await import('../routes/medicine-search.routes.js');

const app = express();
app.use(express.json());
app.use('/api/medicines', medicineSearchRoutes);

describe('Medicine Search API Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/medicines/search', () => {
    it('should search medicines and return results', async () => {
      mockCache.getSearch.mockResolvedValue(null);
      mockSearchRepository.search.mockResolvedValue([
        {
          id: 'med-1',
          name: 'Dolo 650',
          genericName: 'Paracetamol',
          inventoryBatches: [],
        },
      ]);

      const response = await request(app)
        .get('/api/medicines/search')
        .query({ q: 'dolo', limit: '10' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.meta.count).toBe(1);
    });

    it('should support category filter', async () => {
      mockCache.getSearch.mockResolvedValue(null);
      mockSearchRepository.search.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/medicines/search')
        .query({ q: 'para', category: 'cat-uuid-1234' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should support inStockOnly filter', async () => {
      mockCache.getSearch.mockResolvedValue(null);
      mockSearchRepository.search.mockResolvedValue([
        {
          id: 'med-1',
          name: 'Dolo 650',
          inventoryBatches: [{ quantity: 50, reservedQuantity: 0 }],
        },
      ]);

      const response = await request(app)
        .get('/api/medicines/search')
        .query({ q: 'dolo', inStockOnly: 'true' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/medicines/autocomplete', () => {
    it('should return autocomplete suggestions', async () => {
      mockCache.getAutocomplete.mockResolvedValue(null);
      mockSearchRepository.autocomplete.mockResolvedValue([
        { id: 'med-1', name: 'Dolo 650', genericName: 'Paracetamol' },
        { id: 'med-2', name: 'Dolo 250', genericName: 'Paracetamol' },
      ]);

      const response = await request(app)
        .get('/api/medicines/autocomplete')
        .query({ prefix: 'dol' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/medicines/barcode/:barcode', () => {
    it('should lookup medicine by barcode', async () => {
      mockCache.getBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcode.mockResolvedValue({
        id: 'med-1',
        name: 'Dolo 650',
        genericName: 'Paracetamol',
        sellingPrice: 30,
        inventoryBatches: [
          {
            quantity: 100,
            reservedQuantity: 0,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            sellingPrice: 30,
            mrp: 35,
          },
        ],
      });

      const response = await request(app)
        .get('/api/medicines/barcode/890123456789')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.medicine.brandName).toBe('Dolo 650');
    });

    it('should return 404 for non-existent barcode', async () => {
      mockCache.getBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcodeMapping.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/medicines/barcode/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/medicines/sku/:sku', () => {
    it('should lookup medicine by SKU', async () => {
      mockCache.getSku.mockResolvedValue(null);
      mockSearchRepository.findBySku.mockResolvedValue({
        id: 'med-1',
        name: 'Dolo 650',
        sku: 'MED-PARA-650-TAB',
        sellingPrice: 30,
        inventoryBatches: [
          {
            quantity: 100,
            reservedQuantity: 10,
            branchId: 'branch-1',
          },
        ],
      });

      const response = await request(app)
        .get('/api/medicines/sku/MED-PARA-650-TAB')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.medicine.sku).toBe('MED-PARA-650-TAB');
    });

    it('should return 404 for non-existent SKU', async () => {
      mockCache.getSku.mockResolvedValue(null);
      mockSearchRepository.findBySku.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/medicines/sku/nonexistent-sku')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/medicines/:id/alternatives', () => {
    it('should return alternative medicines', async () => {
      mockSearchRepository.findAlternatives.mockResolvedValue([
        { id: 'med-2', name: 'Crocin 650', genericName: 'Paracetamol' },
      ]);

      const response = await request(app)
        .get('/api/medicines/med-1/alternatives')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('GET /api/medicines/:id/availability', () => {
    it('should return branch-wise availability', async () => {
      mockSearchRepository.getAvailability.mockResolvedValue([
        {
          branchId: 'branch-1',
          branchName: 'Main Branch',
          availableStock: 50,
          totalStock: 60,
          expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        },
        {
          branchId: 'branch-2',
          branchName: 'Secondary Branch',
          availableStock: 0,
          totalStock: 0,
        },
      ]);

      const response = await request(app)
        .get('/api/medicines/med-1/availability')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });

  describe('GET /api/medicines/popular-searches', () => {
    it('should return popular search queries', async () => {
      mockCache.getPopularSearches.mockResolvedValue(null);
      mockSearchRepository.getPopularSearches.mockResolvedValue([
        { query: 'dolo', count: 150 },
        { query: 'paracetamol', count: 120 },
      ]);

      const response = await request(app)
        .get('/api/medicines/popular-searches')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });
});
