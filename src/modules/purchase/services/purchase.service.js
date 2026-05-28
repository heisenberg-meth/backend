import purchaseOrderRepository from '../repositories/purchase_order.repository.js';
import { PURCHASE_ORDER_STATUS } from '../../../shared/constants/purchase-order-status.js';

class PurchaseService {
  async createPO(tenantId, data, userId) {
    const { items, supplierId, notes, expectedDeliveryDate } = data;

    // Use a simplified version of pricing calculation for PO
    let subtotal = 0;
    let gstAmount = 0;
    let totalAmount = 0;

    const processedItems = items.map(item => {
      const lineSubtotal = item.purchasePrice * item.quantity;
      const lineGst = (lineSubtotal * (item.gstPercentage || 0)) / 100;
      const lineTotal = lineSubtotal + lineGst;

      subtotal += lineSubtotal;
      gstAmount += lineGst;
      totalAmount += lineTotal;

      return {
        ...item,
        cgst: parseFloat((lineGst / 2).toFixed(2)),
        sgst: parseFloat((lineGst / 2).toFixed(2)),
        igst: 0,
        totalAmount: parseFloat(lineTotal.toFixed(2))
      };
    });

    const orderNumber = await purchaseOrderRepository.getNextPONumber(tenantId);

    return purchaseOrderRepository.createPO({
      tenantId,
      orderNumber,
      supplierId,
      status: PURCHASE_ORDER_STATUS.DRAFT,
      subtotal: parseFloat(subtotal.toFixed(2)),
      gstAmount: parseFloat(gstAmount.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate) : null,
      notes,
      userId,
      items: processedItems
    });
  }

  async getPOs(tenantId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return purchaseOrderRepository.findAll(tenantId, skip, limit);
  }

  async getPOById(id, tenantId) {
    const po = await purchaseOrderRepository.findById(id, tenantId);
    if (!po) throw new Error('Purchase order not found');
    return po;
  }

  async updatePOStatus(id, tenantId, status) {
    return purchaseOrderRepository.updateStatus(id, tenantId, status);
  }
}

export default new PurchaseService();
