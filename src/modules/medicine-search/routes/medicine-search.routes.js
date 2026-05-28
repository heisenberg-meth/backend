import { Router } from 'express';
import searchService from '../services/medicine-search.service.js';
import medicineSearchRepository from '../repositories/medicine-search.repository.js';
import authMiddleware from '../../../middleware/auth.middleware.js';
import { authorize } from '../../../middleware/role.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/search', authorize('medicines.read'), async (req, res, next) => {
  try {
    const result = await searchService.search(req.tenantId, req.query.q, {
      limit: parseInt(req.query.limit) || 20,
      category: req.query.category,
      schedule: req.query.schedule,
      branchId: req.query.branchId,
      inStockOnly: req.query.inStockOnly === 'true',
    });
    res.status(200).json({ success: true, data: result.results, meta: { count: result.results.length } });
  } catch (err) {
    next(err);
  }
});

router.get('/autocomplete', authorize('medicines.read'), async (req, res, next) => {
  try {
    const result = await searchService.autocomplete(req.tenantId, req.query.prefix);
    res.status(200).json({ success: true, data: result.suggestions });
  } catch (err) {
    next(err);
  }
});

router.get('/barcode/:barcode', authorize('medicines.read'), async (req, res, next) => {
  try {
    let medicine = await medicineSearchRepository.findByBarcode(req.params.barcode, req.tenantId);
    if (!medicine) {
      medicine = await medicineSearchRepository.findByBarcodeMapping(req.params.barcode, req.tenantId);
    }
    if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });

    const enriched = medicineSearchRepository.enrichWithInventory(medicine);
    res.status(200).json({ success: true, data: { medicine: enriched } });
  } catch (err) {
    next(err);
  }
});

router.get('/sku/:sku', authorize('medicines.read'), async (req, res, next) => {
  try {
    const medicine = await medicineSearchRepository.findBySku(req.params.sku, req.tenantId);
    if (!medicine) return res.status(404).json({ success: false, message: 'Medicine not found' });
    const enriched = medicineSearchRepository.enrichWithInventory(medicine);
    res.status(200).json({ success: true, data: { medicine: enriched } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/alternatives', authorize('medicines.read'), async (req, res, next) => {
  try {
    const alternatives = await searchService.getAlternatives(req.params.id, req.tenantId);
    res.status(200).json({ success: true, data: alternatives });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/availability', authorize('medicines.read'), async (req, res, next) => {
  try {
    const availability = await searchService.getAvailability(req.params.id, req.tenantId);
    res.status(200).json({ success: true, data: availability });
  } catch (err) {
    next(err);
  }
});

router.get('/popular-searches', authorize('medicines.read'), async (req, res, next) => {
  try {
    const searches = await searchService.getPopularSearches(req.tenantId);
    res.status(200).json({ success: true, data: searches });
  } catch (err) {
    next(err);
  }
});

export default router;
