import prisma from '../../../config/prisma.js';
import transferRepository from '../repositories/transfer.repository.js';
import ledgerRepository from '../../stock/repositories/ledger.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';
import inventoryService from '../../realtime-inventory/services/inventory.service.js';

class TransferService {
  async requestTransfer(tenantId, data, userId) {
    const transfer = await prisma.$transaction(async (tx) => {
      const transferNumber = await transferRepository.getNextTransferNumber(tenantId);

      for (const item of data.items) {
        const [batch] = await tx.$queryRaw`
          SELECT * FROM "InventoryBatch"
          WHERE "id" = ${item.batchId}
          AND "branchId" = ${data.sourceBranchId}
          AND "deletedAt" IS NULL
          FOR UPDATE
        `;

        if (!batch || batch.availableQuantity < item.quantity) {
          throw new Error(`Insufficient stock in source branch for batch ${item.batchId}`);
        }

        const updatedBatch = await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            availableQuantity: batch.availableQuantity - item.quantity,
            reservedQuantity: batch.reservedQuantity + item.quantity,
          },
        });

        await inventoryService.recordTransaction(
          tx,
          tenantId,
          {
            medicineId: batch.medicineId,
            batchId: batch.id,
            branchId: data.sourceBranchId,
            transactionType: 'TRANSFER_RESERVE',
            quantityChange: -item.quantity,
            quantityAfter: updatedBatch.quantity,
            referenceType: 'TRANSFER',
            referenceId: transferNumber,
            notes: `Reserved for transfer ${transferNumber}`,
          },
          userId,
        );
      }

      return transferRepository.createTransfer(
        {
          tenantId,
          sourceBranchId: data.sourceBranchId,
          destinationBranchId: data.destinationBranchId,
          transferNumber,
          status: 'PENDING',
          initiatedBy: userId,
          notes: data.notes,
          items: data.items,
        },
        tx,
      );
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'REQUEST_TRANSFER',
      target: transfer.transferNumber,
      type: 'INVENTORY',
    });

    return transfer;
  }

  async approveTransfer(transferId, tenantId, userId) {
    const transfer = await transferRepository.updateStatus(
      transferId,
      tenantId,
      'IN_TRANSIT',
      userId,
    );

    await auditService.log({
      tenantId,
      userId,
      action: 'APPROVE_TRANSFER',
      target: transfer.transferNumber,
      type: 'INVENTORY',
    });

    return transfer;
  }

  async receiveTransfer(transferId, tenantId, userId) {
    const updatedTransfer = await prisma.$transaction(async (tx) => {
      const transfer = await transferRepository.findById(transferId, tenantId, tx);
      if (!transfer || transfer.status !== 'IN_TRANSIT') {
        throw new Error('Transfer not found or not in transit');
      }

      for (const item of transfer.items) {
        const sourceBatch = item.batch;

        await tx.inventoryBatch.update({
          where: { id: sourceBatch.id },
          data: {
            quantity: sourceBatch.quantity - item.quantity,
            reservedQuantity: sourceBatch.reservedQuantity - item.quantity,
          },
        });

        const sourceBatches = await tx.inventoryBatch.findMany({
          where: { medicineId: sourceBatch.medicineId, branchId: transfer.sourceBranchId },
        });
        const prevSourceStock = sourceBatches.reduce((sum, b) => sum + b.availableQuantity, 0);

        await ledgerRepository.createTransaction(
          {
            tenantId,
            medicineId: sourceBatch.medicineId,
            batchId: sourceBatch.id,
            type: 'TRANSFER_OUT',
            quantity: -item.quantity,
            previousStock: prevSourceStock + item.quantity,
            newStock: prevSourceStock,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes: `Transferred to ${transfer.destinationBranch.name}`,
            createdBy: userId,
          },
          tx,
        );

        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: transfer.sourceBranchId,
            medicineId: sourceBatch.medicineId,
            batchId: sourceBatch.id,
            movementType: 'TRANSFER_OUT',
            quantity: -item.quantity,
            quantityAfter: sourceBatch.quantity - item.quantity,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            performedBy: userId,
            notes: `Transfer out to ${transfer.destinationBranch.name}`,
          },
        });

        await tx.inventory.upsert({
          where: {
            tenantId_branchId_medicineId: {
              tenantId,
              branchId: transfer.sourceBranchId,
              medicineId: sourceBatch.medicineId,
            },
          },
          update: { currentStock: { increment: -item.quantity } },
          create: {
            tenantId,
            branchId: transfer.sourceBranchId,
            medicineId: sourceBatch.medicineId,
            currentStock: -item.quantity,
          },
        });

        const destBatch = await tx.inventoryBatch.findFirst({
          where: {
            medicineId: sourceBatch.medicineId,
            batchNumber: sourceBatch.batchNumber,
            branchId: transfer.destinationBranchId,
          },
        });

        let newBatchId;
        let currentDestQty;
        if (destBatch) {
          const updatedDest = await tx.inventoryBatch.update({
            where: { id: destBatch.id },
            data: {
              quantity: destBatch.quantity + item.quantity,
              availableQuantity: destBatch.availableQuantity + item.quantity,
            },
          });
          newBatchId = destBatch.id;
          currentDestQty = updatedDest.quantity;
        } else {
          const newBatch = await tx.inventoryBatch.create({
            data: {
              medicineId: sourceBatch.medicineId,
              branchId: transfer.destinationBranchId,
              batchNumber: sourceBatch.batchNumber,
              barcode: sourceBatch.barcode,
              quantity: item.quantity,
              availableQuantity: item.quantity,
              expiryDate: sourceBatch.expiryDate,
              manufacturingDate: sourceBatch.manufacturingDate,
              purchasePrice: sourceBatch.purchasePrice,
              sellingPrice: sourceBatch.sellingPrice,
              supplierId: sourceBatch.supplierId,
              status: 'ACTIVE',
            },
          });
          newBatchId = newBatch.id;
          currentDestQty = item.quantity;
        }

        const destBatches = await tx.inventoryBatch.findMany({
          where: { medicineId: sourceBatch.medicineId, branchId: transfer.destinationBranchId },
        });
        const prevDestStock =
          destBatches.reduce((sum, b) => sum + b.availableQuantity, 0) - item.quantity;

        await ledgerRepository.createTransaction(
          {
            tenantId,
            medicineId: sourceBatch.medicineId,
            batchId: newBatchId,
            type: 'TRANSFER_IN',
            quantity: item.quantity,
            previousStock: prevDestStock,
            newStock: prevDestStock + item.quantity,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes: `Received from ${transfer.sourceBranch.name}`,
            createdBy: userId,
          },
          tx,
        );

        await tx.stockMovement.create({
          data: {
            tenantId,
            branchId: transfer.destinationBranchId,
            medicineId: sourceBatch.medicineId,
            batchId: newBatchId,
            movementType: 'TRANSFER_IN',
            quantity: item.quantity,
            quantityAfter: currentDestQty,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            performedBy: userId,
            notes: `Transfer in from ${transfer.sourceBranch.name}`,
          },
        });

        await tx.inventory.upsert({
          where: {
            tenantId_branchId_medicineId: {
              tenantId,
              branchId: transfer.destinationBranchId,
              medicineId: sourceBatch.medicineId,
            },
          },
          update: { currentStock: { increment: item.quantity } },
          create: {
            tenantId,
            branchId: transfer.destinationBranchId,
            medicineId: sourceBatch.medicineId,
            currentStock: item.quantity,
          },
        });

        await inventoryService.recordTransaction(
          tx,
          tenantId,
          {
            medicineId: sourceBatch.medicineId,
            batchId: newBatchId,
            branchId: transfer.destinationBranchId,
            transactionType: 'TRANSFER_IN',
            quantityChange: item.quantity,
            quantityAfter: currentDestQty,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            notes: `Received from ${transfer.sourceBranch.name}`,
          },
          userId,
        );
      }

      return transferRepository.updateStatus(transferId, tenantId, 'RECEIVED', null, tx);
    });

    await auditService.log({
      tenantId,
      userId,
      action: 'RECEIVE_TRANSFER',
      target: updatedTransfer.transferNumber,
      type: 'INVENTORY',
    });

    return updatedTransfer;
  }

  async getTransfers(tenantId, filters = {}, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return transferRepository.findAll(tenantId, filters, skip, limit);
  }
}

export default new TransferService();
