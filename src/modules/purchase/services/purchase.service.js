import purchaseOrderRepository from '../repositories/purchase_order.repository.js';
import logger from '../../../shared/utils/logger.js';

class PurchaseService {
  async createPO(tenantId, data, userId) {
    let subtotal = 0;
    let gstAmount = 0;

    const items = data.items.map((item) => {
      const lineSubtotal = item.quantity * item.purchasePrice;
      const lineGst = lineSubtotal * (item.gstPercentage / 100);
      subtotal += lineSubtotal;
      gstAmount += lineGst;
      return {
        medicineId: item.medicineId,
        quantity: item.quantity,
        purchasePrice: item.purchasePrice,
        sellingPrice: item.sellingPrice,
        gstPercentage: item.gstPercentage,
        expiryDate: item.expiryDate,
        batchNumber: item.batchNumber,
        lineTotal: lineSubtotal + lineGst,
      };
    });

    const totalAmount = subtotal + gstAmount;

    const poNumber = await purchaseOrderRepository.getNextPONumber(tenantId);

    const po = await purchaseOrderRepository.createPO({
      tenantId,
      poNumber,
      supplierId: data.supplierId,
      subtotal,
      gstAmount,
      totalAmount,
      status: 'DRAFT',
      items: items.map((item) => ({
        ...item,
        lineTotal: item.purchasePrice * item.quantity,
      })),
      notes: data.notes,
      expectedDelivery: data.expectedDelivery,
      createdBy: userId,
    });

    logger.info(`[Purchase] Created PO ${poNumber} for supplier ${data.supplierId}: ${totalAmount}`);
    return po;
  }
}

export default new PurchaseService();
