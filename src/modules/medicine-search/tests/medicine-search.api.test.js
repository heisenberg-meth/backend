import { jest, describe, beforeEach, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const searchRepoPath = path.resolve(__dirname, '../repositories/medicine-search.repository.js');
const cachePath = path.resolve(__dirname, '../cache/medicine-search.cache.js');
const prismaPath = path.resolve(__dirname, '../../../config/prisma.js');
const localEventBusPath = path.resolve(__dirname, '../../../shared/events/local-event-bus.js');
const erpEventBusPath = path.resolve(__dirname, '../../../shared/events/erp-event-bus.js');
const loggerPath = path.resolve(__dirname, '../../../shared/utils/logger.js');
const authFastifyPath = path.resolve(__dirname, '../../../middleware/auth.fastify.js');

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
  emitLocalEvent: jest.fn(),
  localEventBus: { emit: jest.fn(), removeAllListeners: jest.fn() },
}));

jest.unstable_mockModule(erpEventBusPath, () => ({
  emitEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule(loggerPath, () => ({
  default: mockLogger,
}));

jest.unstable_mockModule(authFastifyPath, () => ({
  authenticate: async (request) => {
    request.user = { id: 'user-1', role: 'ADMIN' };
    request.tenantId = 'tenant-1';
  },
  requireTenant: async (request) => {
    request.tenantId = 'tenant-1';
  },
}));

const { default: medicineSearchRoutes } =
  await import('../routes/medicine-search.fastify.routes.js');

describe('Medicine Search API Integration', () => {
  let app;

  beforeAll(async () => {
    app = Fastify();
    await app.register(medicineSearchRoutes, { prefix: '/api/medicines' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

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

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/search',
        query: { q: 'dolo', limit: '10' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.meta.count).toBe(1);
    });

    it('should support category filter', async () => {
      mockCache.getSearch.mockResolvedValue(null);
      mockSearchRepository.search.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/search',
        query: { q: 'para', category: 'cat-uuid-1234' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
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

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/search',
        query: { q: 'dolo', inStockOnly: 'true' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/medicines/autocomplete', () => {
    it('should return autocomplete suggestions', async () => {
      mockCache.getAutocomplete.mockResolvedValue(null);
      mockSearchRepository.autocomplete.mockResolvedValue([
        { id: 'med-1', name: 'Dolo 650', genericName: 'Paracetamol' },
        { id: 'med-2', name: 'Dolo 250', genericName: 'Paracetamol' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/autocomplete',
        query: { prefix: 'dol' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
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
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            sellingPrice: 30,
            mrp: 35,
          },
        ],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/barcode/890123456789',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.medicine.name).toBe('Dolo 650');
    });

    it('should return 404 for non-existent barcode', async () => {
      mockCache.getBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcodeMapping.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/barcode/nonexistent',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
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

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/sku/MED-PARA-650-TAB',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.medicine.sku).toBe('MED-PARA-650-TAB');
    });

    it('should return 404 for non-existent SKU', async () => {
      mockCache.getSku.mockResolvedValue(null);
      mockSearchRepository.findBySku.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/sku/nonexistent-sku',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/medicines/:id/alternatives', () => {
    it('should return alternative medicines', async () => {
      mockSearchRepository.findAlternatives.mockResolvedValue([
        { id: 'med-2', name: 'Crocin 650', genericName: 'Paracetamol' },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/med-1/alternatives',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
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
          expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          branchId: 'branch-2',
          branchName: 'Secondary Branch',
          availableStock: 0,
          totalStock: 0,
        },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/med-1/availability',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });
  });

  describe('GET /api/medicines/popular-searches', () => {
    it('should return popular search queries', async () => {
      mockCache.getPopularSearches.mockResolvedValue(null);
      mockSearchRepository.getPopularSearches.mockResolvedValue([
        { query: 'dolo', count: 150 },
        { query: 'paracetamol', count: 120 },
      ]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/medicines/popular-searches',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
    });
  });
});
