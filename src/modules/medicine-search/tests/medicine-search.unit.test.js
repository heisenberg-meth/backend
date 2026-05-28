import { jest , describe, beforeEach, it, expect } from '@jest/globals';
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

const { default: medicineSearchService } = await import('../services/medicine-search.service.js');
const { default: barcodeLookupService } = await import('../barcode/barcode-lookup.service.js');
const { default: skuLookupService } = await import('../sku/sku-lookup.service.js');

describe('MedicineSearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('should return cached results when available', async () => {
      const cachedResults = [{ id: 'med-1', brandName: 'Dolo 650' }];
      mockCache.getSearch.mockResolvedValue(cachedResults);

      const { results, source } = await medicineSearchService.search('tenant-1', 'dolo', {});

      expect(source).toBe('cache');
      expect(results).toEqual(cachedResults);
    });

    it('should search database when cache miss', async () => {
      mockCache.getSearch.mockResolvedValue(null);
      mockSearchRepository.search.mockResolvedValue([
        { id: 'med-1', name: 'Dolo 650', inventoryBatches: [] },
      ]);

      const { results, source } = await medicineSearchService.search('tenant-1', 'dolo', {});

      expect(source).toBe('database');
      expect(results).toHaveLength(1);
    });
  });

  describe('autocomplete', () => {
    it('should return cached suggestions when available', async () => {
      const cached = [{ id: 'med-1', name: 'Dolo 650' }];
      mockCache.getAutocomplete.mockResolvedValue(cached);

      const { suggestions, source } = await medicineSearchService.autocomplete('tenant-1', 'dol');

      expect(source).toBe('cache');
      expect(suggestions).toEqual(cached);
    });

    it('should query database when cache miss', async () => {
      mockCache.getAutocomplete.mockResolvedValue(null);
      mockSearchRepository.autocomplete.mockResolvedValue([
        { id: 'med-1', name: 'Dolo 650' },
      ]);

      const { suggestions, source } = await medicineSearchService.autocomplete('tenant-1', 'dol');

      expect(source).toBe('database');
      expect(suggestions).toHaveLength(1);
    });
  });

  describe('fuzzySearch', () => {
    it('should return fuzzy matched results', async () => {
      mockSearchRepository.fuzzySearch.mockResolvedValue([
        { id: 'med-1', name: 'Paracetamol', similarity_score: 0.85 },
      ]);

      const results = await medicineSearchService.fuzzySearch('tenant-1', 'paracitamol');

      expect(results).toHaveLength(1);
      expect(results[0].similarity_score).toBe(0.85);
    });
  });

  describe('getPopularSearches', () => {
    it('should return cached popular searches', async () => {
      const cached = [{ query: 'dolo', count: 50 }];
      mockCache.getPopularSearches.mockResolvedValue(cached);

      const results = await medicineSearchService.getPopularSearches('tenant-1');

      expect(results).toEqual(cached);
    });
  });
});

describe('BarcodeLookupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('lookup', () => {
    it('should return cached barcode result', async () => {
      const cached = {
        medicine: { id: 'med-1', brandName: 'Dolo 650' },
        pricing: { sellingPrice: 30 },
        inventory: { availableStock: 100 },
      };
      mockCache.getBarcode.mockResolvedValue(cached);

      const result = await barcodeLookupService.lookup('890123456789', 'tenant-1');

      expect(result.source).toBe('cache');
      expect(result.medicine.brandName).toBe('Dolo 650');
    });

    it('should lookup medicine by barcode in database', async () => {
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

      const result = await barcodeLookupService.lookup('890123456789', 'tenant-1');

      expect(result.source).toBe('database');
      expect(result.medicine.brandName).toBe('Dolo 650');
      expect(result.inventory.availableStock).toBe(100);
    });

    it('should return null for non-existent barcode', async () => {
      mockCache.getBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcodeMapping.mockResolvedValue(null);

      const result = await barcodeLookupService.lookup('invalid', 'tenant-1');

      expect(result).toBeNull();
    });

    it('should flag expired medicines', async () => {
      mockCache.getBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcode.mockResolvedValue({
        id: 'med-1',
        name: 'Expired Med',
        sellingPrice: 30,
        inventoryBatches: [
          {
            quantity: 10,
            reservedQuantity: 0,
            expiryDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            sellingPrice: 30,
            mrp: 35,
          },
        ],
      });

      const result = await barcodeLookupService.lookup('expired-barcode', 'tenant-1');

      expect(result.expiryWarning.type).toBe('EXPIRED');
    });

    it('should flag near-expiry medicines', async () => {
      mockCache.getBarcode.mockResolvedValue(null);
      mockSearchRepository.findByBarcode.mockResolvedValue({
        id: 'med-1',
        name: 'Near Expiry Med',
        sellingPrice: 30,
        inventoryBatches: [
          {
            quantity: 10,
            reservedQuantity: 0,
            expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            sellingPrice: 30,
            mrp: 35,
          },
        ],
      });

      const result = await barcodeLookupService.lookup('near-expiry-barcode', 'tenant-1');

      expect(result.expiryWarning.type).toBe('NEAR_EXPIRY');
    });
  });
});

describe('SkuLookupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('lookup', () => {
    it('should return cached SKU result', async () => {
      const cached = {
        medicine: { id: 'med-1', brandName: 'Dolo 650', sku: 'MED-PARA-650-TAB' },
        inventory: { availableStock: 100 },
      };
      mockCache.getSku.mockResolvedValue(cached);

      const result = await skuLookupService.lookup('MED-PARA-650-TAB', 'tenant-1');

      expect(result.source).toBe('cache');
      expect(result.medicine.sku).toBe('MED-PARA-650-TAB');
    });

    it('should lookup medicine by SKU in database', async () => {
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

      const result = await skuLookupService.lookup('MED-PARA-650-TAB', 'tenant-1');

      expect(result.source).toBe('database');
      expect(result.inventory.availableStock).toBe(90);
    });

    it('should return null for non-existent SKU', async () => {
      mockCache.getSku.mockResolvedValue(null);
      mockSearchRepository.findBySku.mockResolvedValue(null);

      const result = await skuLookupService.lookup('invalid-sku', 'tenant-1');

      expect(result).toBeNull();
    });
  });
});
