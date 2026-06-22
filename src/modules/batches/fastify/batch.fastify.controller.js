import batchService from '../services/batch.service.js';

class BatchFastifyController {
  async createBatch(request, reply) {
    try {
      const data = {
        ...request.body,
        branchId: request.body.branchId || request.branchId,
      };
      const batch = await batchService.createBatch(data, request.tenantId, request.user.id);
      return reply.code(201).send({ success: true, data: batch });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-create' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getBatches(request, reply) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        branchId,
        supplierId,
        medicineId,
        medicine_id,
        sortBy,
        order,
      } = request.query;
      const result = await batchService.getBatches({
        tenantId: request.tenantId,
        status,
        branchId,
        supplierId,
        medicineId: medicineId || medicine_id,
        sortBy: sortBy || 'expiryDate',
        order: order || 'asc',
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      });
      return reply.send({ success: true, data: result });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-list' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getBatchById(request, reply) {
    try {
      const batch = await batchService.getBatch(request.params.id);
      return reply.send({ success: true, data: batch });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-by-id' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async updateBatch(request, reply) {
    try {
      const batch = await batchService.updateBatch(request.params.id, request.body, request.user.id);
      return reply.send({ success: true, data: batch });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-update' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async deleteBatch(request, reply) {
    try {
      await batchService.deleteBatch(request.params.id, request.tenantId, request.user.id);
      return reply.send({ success: true, message: 'Batch deleted successfully' });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-delete' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async quarantineBatch(request, reply) {
    try {
      const batch = await batchService.quarantineBatch(
        request.params.id,
        request.body.reason,
        request.tenantId,
        request.user.id,
      );
      return reply.send({ success: true, data: batch, message: 'Batch quarantined successfully' });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-quarantine' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async recallBatch(request, reply) {
    try {
      const batch = await batchService.recallBatch(
        request.params.id,
        request.body.reason,
        request.tenantId,
        request.user.id,
      );
      return reply.send({ success: true, data: batch, message: 'Batch recalled successfully' });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-recall' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async releaseQuarantine(request, reply) {
    try {
      const batch = await batchService.releaseQuarantine(
        request.params.id,
        request.tenantId,
        request.user.id,
      );
      return reply.send({ success: true, data: batch, message: 'Batch released from quarantine' });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-release-quarantine' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getFefoBatches(request, reply) {
    try {
      const { quantity } = request.query;
      const result = await batchService.getFefoBatches(
        request.params.medicineId,
        request.tenantId,
        quantity,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-fefo' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getQuarantined(request, reply) {
    try {
      const batches = await batchService.getQuarantined(request.tenantId);
      return reply.send({ success: true, data: batches });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-quarantined-list' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async assignSupplier(request, reply) {
    try {
      const batch = await batchService.assignSupplier(
        request.params.id,
        request.body.supplierId,
        request.tenantId,
      );
      return reply.send({ success: true, data: batch });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-assign-supplier' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async bulkAssignSupplier(request, reply) {
    try {
      const { batchIds, supplierId } = request.body;
      const result = await batchService.bulkAssignSupplier(batchIds, supplierId, request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-bulk-assign-supplier' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async backfillSupplierFromMedicine(request, reply) {
    try {
      const result = await batchService.backfillSupplierFromMedicine(request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-backfill-supplier' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async exportBatchesWithoutSupplier(request, reply) {
    try {
      const result = await batchService.exportBatchesWithoutSupplier(request.tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-export-no-supplier' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async importSupplierAssignments(request, reply) {
    try {
      const { assignments } = request.body;
      const result = await batchService.importSupplierAssignments(request.tenantId, assignments);
      return reply.send({ success: true, data: result });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'batch-import-supplier' }, 'Batch error');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new BatchFastifyController();
