import medicineService from '../service/medicine.prisma.service.js';
import barcodeService from '../service/barcode.service.js';
import expiryService from '../service/expiry.service.js';
import unifiedInventorySummaryService from '../service/unified-inventory-summary.service.js';
import { success, error as errorResponse } from '../../../shared/helpers/response.js';

class MedicineFastifyController {
  async getMedicines(request) {
    const {
      search,
      q,
      categoryId,
      manufacturerId,
      isActive,
      sortBy,
      order,
      page,
      limit,
      branchId,
    } = request.query;
    const finalSearch = search || q;

    // Automatically set lowStock if URL contains 'low-stock'
    const lowStock = request.query.lowStock || request.url.includes('low-stock');

    const result = await medicineService.getMedicines({
      tenantId: request.tenantId,
      branchId: branchId || request.branchId, // Use explicit or session branch
      query: { search: finalSearch, categoryId, manufacturerId, isActive, lowStock, sortBy, order },
      pagination: { page, limit },
    });
    const dataArray = Array.isArray(result)
      ? result
      : result.docs || result.data || result.medicines || [];
    const total = result.total || (Array.isArray(result) ? result.length : 0);
    const p = parseInt(page) || 1;
    const lmt = parseInt(limit) || 20;
    return success({
      items: dataArray,
      total,
      page: p,
      limit: lmt,
      totalPages: Math.ceil(total / lmt),
    });
  }

  async getLowStockAlerts(request, reply) {
    try {
      const { branchId } = request.query;
      const result = await medicineService.getLowStockAlerts(
        request.tenantId,
        branchId || request.branchId,
      );
      return success(result);
    } catch (err) {
      return reply.code(500).send(errorResponse(err.message, 'ALERTS_FETCH_FAILED'));
    }
  }

  async getInventorySummaryData(request) {
    const { branchId } = request.query;
    const summary = await medicineService.getInventorySummary(
      request.tenantId,
      branchId || request.branchId,
    );
    return success(summary);
  }

  async getValueSummary(request) {
    const { branchId } = request.query;
    const summary = await unifiedInventorySummaryService.getValueSummary(
      request.tenantId,
      branchId || request.branchId,
    );
    return success(summary);
  }

  async getCategoryBreakdown(request) {
    const { branchId } = request.query;
    const data = await unifiedInventorySummaryService.getCategoryBreakdown(
      request.tenantId,
      branchId || request.branchId,
    );
    return success(data);
  }

  async getHighValueStock(request) {
    const { branchId } = request.query;
    const data = await unifiedInventorySummaryService.getHighValueStock(
      request.tenantId,
      branchId || request.branchId,
    );
    return success(data);
  }

  async getExpiryRisk(request) {
    const { branchId } = request.query;
    const data = await unifiedInventorySummaryService.getExpiryRisk(
      request.tenantId,
      branchId || request.branchId,
    );
    return success(data);
  }

  async getMedicine(request, reply) {
    try {
      const { branchId } = request.query;
      const medicine = await medicineService.getMedicine(
        request.params.id,
        request.tenantId,
        branchId || request.branchId,
      );
      return success(medicine);
    } catch (err) {
      return reply.code(404).send(errorResponse(err.message, 'NOT_FOUND'));
    }
  }

  async getMedicineByBarcode(request, reply) {
    try {
      const { branchId } = request.query;
      const medicine = await medicineService.getMedicineByBarcode(
        request.params.barcode,
        request.tenantId,
        branchId || request.branchId,
      );
      return success(medicine);
    } catch (err) {
      return reply.code(404).send(errorResponse(err.message, 'NOT_FOUND'));
    }
  }

  async createMedicine(request, reply) {
    try {
      const branchId = request.branchId || request.body.branchId || request.user?.branchId;

      const payload = {
        ...request.body,
        branchId,
      };

      const medicine = await medicineService.createMedicine(
        payload,
        request.tenantId,
        request.user.id,
      );
      return success(medicine);
    } catch (err) {
      request.log.error({
        validationError: err,
        body: request.body,
      });
      return reply.code(400).send(errorResponse(err.message, 'VALIDATION_ERROR'));
    }
  }

  async updateMedicine(request, reply) {
    try {
      const medicine = await medicineService.updateMedicine(
        request.params.id,
        request.tenantId,
        request.user,
        request.body,
      );
      return success(medicine);
    } catch (err) {
      const statusCode = err.message.includes('only allowed to update') ? 403 : 400;
      return reply
        .code(statusCode)
        .send(errorResponse(err.message, statusCode === 403 ? 'FORBIDDEN' : 'UPDATE_FAILED'));
    }
  }

  async deleteMedicine(request, reply) {
    try {
      await medicineService.deleteMedicine(request.params.id, request.tenantId, request.user.id);
      return success({ message: 'Medicine deleted successfully' });
    } catch (err) {
      return reply.code(400).send(errorResponse(err.message, 'DELETE_FAILED'));
    }
  }

  async clearAllMedicines(request, reply) {
    try {
      await medicineService.clearAllMedicines(request.tenantId, request.user.id);
      return success({ message: 'Inventory reset successfully' });
    } catch (err) {
      return reply.code(400).send(errorResponse(err.message, 'RESET_FAILED'));
    }
  }

  async searchMaster(request) {
    const { q } = request.query;
    const result = await medicineService.searchMaster(q);
    return success(result);
  }

  async batchRecall(request, reply) {
    try {
      const result = await medicineService.batchRecall(
        request.body,
        request.tenantId,
        request.user.id,
      );
      return success(result);
    } catch (err) {
      return reply.code(400).send(errorResponse(err.message, 'RECALL_FAILED'));
    }
  }

  async addBatch(request, reply) {
    try {
      const batchData = {
        ...request.body,
        branchId: request.body.branchId || request.branchId,
      };
      const batch = await medicineService.addBatch(
        request.params.id,
        request.tenantId,
        batchData,
        request.user.id,
      );
      return reply.code(201).send(success(batch));
    } catch (err) {
      return reply.code(400).send(errorResponse(err.message, 'ADD_BATCH_FAILED'));
    }
  }

  async getBarcode(request, reply) {
    try {
      const { text, type } = request.query;
      if (!text)
        return reply.code(400).send(errorResponse('Text parameter is required', 'MISSING_PARAM'));

      const buffer = await barcodeService.generateBarcode(text, type);
      reply.header('Content-Type', 'image/png');
      return reply.send(buffer);
    } catch (err) {
      return reply.code(500).send(errorResponse(err.message, 'GENERATE_ERROR'));
    }
  }

  async getNearExpiry(request) {
    const { days } = request.query;
    const batches = await expiryService.getNearExpiryBatches(
      request.tenantId,
      parseInt(days) || 30,
    );
    return success(batches);
  }

  async getExpirySummary(request) {
    const summary = await expiryService.getExpirySummary(request.tenantId);
    return success(summary);
  }
}

export default new MedicineFastifyController();
