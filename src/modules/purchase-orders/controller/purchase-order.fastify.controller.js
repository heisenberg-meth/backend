import purchaseOrderService from '../service/purchase-order.service.js';
import logger from '../../../shared/utils/logger.js';

class PurchaseOrderFastifyController {
  async getOrders(request, reply) {
    const tenantId = request.tenantId;
    const filters = request.query;
    try {
      const orders = await purchaseOrderService.getOrders(tenantId, filters);
      return reply.send({ success: true, data: orders });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to get purchase orders');
      return reply.code(500).send({ success: false, error: 'Failed to retrieve purchase orders' });
    }
  }

  async getPendingOrders(request, reply) {
    const tenantId = request.tenantId;
    try {
      const statuses = [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'SENT',
        'PARTIALLY_RECEIVED',
        'ORDERED',
      ];
      const orders = await purchaseOrderService.getOrdersByStatus(tenantId, statuses);
      return reply.send({ success: true, data: orders });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to retrieve pending orders' });
    }
  }

  async getCompletedOrders(request, reply) {
    const tenantId = request.tenantId;
    try {
      const statuses = ['RECEIVED', 'RECONCILED'];
      const orders = await purchaseOrderService.getOrdersByStatus(tenantId, statuses);
      return reply.send({ success: true, data: orders });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to retrieve completed orders' });
    }
  }

  async getOrdersBySupplier(request, reply) {
    const { supplierId } = request.params;
    const tenantId = request.tenantId;
    try {
      const orders = await purchaseOrderService.getOrdersBySupplier(tenantId, supplierId);
      return reply.send({ success: true, data: orders });
    } catch {
      return reply.code(500).send({ success: false, error: 'Failed to retrieve supplier orders' });
    }
  }

  async getOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    try {
      const order = await purchaseOrderService.getOrderById(tenantId, id);
      return reply.send({ success: true, data: order });
    } catch (error) {
      return reply.code(404).send({ success: false, error: error.message });
    }
  }

  async createOrder(request, reply) {
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.createOrder(tenantId, userId, request.body);
      return reply.code(201).send({
        success: true,
        message: 'Purchase order created successfully',
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          supplierId: order.supplierId,
          branchId: order.branchId,
          expectedDeliveryDate: order.expectedDeliveryDate,
          paymentMode: order.paymentMode,
          paymentTermsDays: order.paymentTermsDays,
          discountAmount: Number(order.discountAmount),
          subtotal: Number(order.subtotal),
          gstAmount: Number(order.gstAmount),
          totalAmount: Number(order.totalAmount),
          notes: order.notes,
          createdAt: order.createdAt,
          items: order.items.map((item) => ({
            id: item.id,
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            gstPercentage: item.gstPercentage,
            totalAmount: Number(item.totalAmount),
          })),
        },
      });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to create purchase order');
      const statusCode = error.message.includes('not found') ? 404 : 400;
      return reply.code(statusCode).send({ success: false, message: error.message });
    }
  }

  async approveOrder(request, reply) {
    const { id } = request.params;
    const { notes } = request.body;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.approveOrder(tenantId, id, userId, notes);
      return reply.send({ success: true, data: order, message: 'Purchase order approved' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async updateDraftOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.updateDraftOrder(tenantId, id, userId, request.body);
      return reply.send({ success: true, data: order, message: 'Purchase order updated' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async deleteDraftOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.deleteDraftOrder(tenantId, id, userId);
      return reply.send({ success: true, data: order, message: 'Purchase order deleted' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async submitOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.submitOrder(tenantId, id, userId);
      return reply.send({ success: true, data: order, message: 'Purchase order submitted for approval' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async requestApproval(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.requestApproval(tenantId, id, userId);
      return reply.send({ success: true, data: order, message: 'Purchase order routed for approval' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async rejectOrder(request, reply) {
    const { id } = request.params;
    const { reason } = request.body;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.rejectOrder(tenantId, id, userId, reason);
      return reply.send({ success: true, data: order, message: 'Purchase order rejected' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async sendOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.sendOrder(tenantId, id, userId);
      return reply.send({ success: true, data: order, message: 'Purchase order sent to supplier' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async acknowledgeOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.acknowledgeOrder(tenantId, id, userId);
      return reply.send({ success: true, data: order, message: 'Purchase order acknowledged' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async reviseOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.reviseOrder(tenantId, id, userId, request.body);
      return reply.send({ success: true, data: order, message: 'Purchase order revised' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async getAudit(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    try {
      const audit = await purchaseOrderService.getAudit(tenantId, id);
      return reply.send({ success: true, data: audit });
    } catch (error) {
      return reply.code(500).send({ success: false, error: error.message });
    }
  }

  async receiveOrder(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const result = await purchaseOrderService.receiveOrder(tenantId, id, userId, request.body);
      return reply.send({
        success: true,
        message: 'Goods received successfully. Inventory, invoice, and supplier ledger updated.',
        data: {
          grnId: result.grn.id,
          grnNumber: result.grn.grnNumber,
          orderStatus: result.orderStatus,
          purchaseInvoiceId: result.purchaseInvoice?.id,
          purchaseInvoiceNumber: result.purchaseInvoice?.invoiceNumber,
          totalAmount: result.totalAmount,
          allReceived: result.allReceived,
          receivedAt: result.grn.receivedDate,
        },
      });
    } catch (error) {
      logger.error({ err: error, id, tenantId }, 'Failed to receive purchase order');
      return reply.code(400).send({
        success: false,
        message: error.message,
        code: 'PURCHASE_RECEIPT_FAILED',
      });
    }
  }

  async getInvoices(request, reply) {
    const tenantId = request.tenantId;
    try {
      const invoices = await purchaseOrderService.getPurchaseInvoices(tenantId);
      return reply.send({ success: true, data: invoices });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to get purchase invoices');
      return reply
        .code(500)
        .send({ success: false, error: 'Failed to retrieve purchase invoices' });
    }
  }

  async cancelOrder(request, reply) {
    const { id } = request.params;
    const { reason } = request.body;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const order = await purchaseOrderService.cancelOrder(tenantId, id, userId, reason);
      return reply.send({ success: true, data: order, message: 'Purchase order cancelled' });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async updateStatus(request, reply) {
    const { id } = request.params;
    const { status } = request.body;
    const tenantId = request.tenantId;
    try {
      const order = await purchaseOrderService.updateStatus(id, tenantId, status);
      return reply.send({ success: true, data: order });
    } catch (error) {
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async createReorder(request, reply) {
    const tenantId = request.tenantId;
    const userId = request.user.id;
    const { medicineId, quantity } = request.body;
    try {
      const result = await purchaseOrderService.createReorder(tenantId, userId, { medicineId, quantity });
      return reply.code(201).send({ success: true, data: result });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to create reorder');
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async updateInvoicePaymentStatus(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    const userId = request.user.id;
    try {
      const result = await purchaseOrderService.updatePaymentStatus(tenantId, id, request.body, userId);
      return reply.send({ success: true, data: result, message: 'Payment status updated' });
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to update payment status');
      return reply.code(400).send({ success: false, error: error.message });
    }
  }

  async generatePdf(request, reply) {
    const { id } = request.params;
    const tenantId = request.tenantId;
    try {
      const order = await purchaseOrderService.getOrderById(tenantId, id);
      if (!order) return reply.code(404).send({ success: false, error: 'Order not found' });

      const supplier = order.supplier?.name ?? 'Unknown Supplier';
      const poNumber = order.orderNumber;
      const createdAt = new Date(order.createdAt).toLocaleDateString('en-IN');
      const items = order.items ?? [];

      const rows = items
        .map(
          (item, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${item.medicineName ?? 'Unknown'}</td>
            <td>${item.quantity}</td>
            <td>&#8377;${Number(item.unitPrice ?? 0).toFixed(2)}</td>
            <td>${Number(item.gstPercentage ?? 0)}%</td>
            <td>&#8377;${Number(item.totalAmount ?? 0).toFixed(2)}</td>
          </tr>`,
        )
        .join('');

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Purchase Order ${poNumber}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 40px; color: #1a1a2e; font-size: 14px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  .logo-area h1 { color: #6c63ff; font-size: 28px; margin: 0; }
  .logo-area p { margin: 4px 0 0; color: #6b7280; font-size: 13px; }
  .po-meta { text-align: right; }
  .po-meta .po-number { font-size: 20px; font-weight: 700; color: #1a1a2e; }
  .po-meta p { margin: 4px 0; color: #6b7280; }
  .divider { border: none; border-top: 2px solid #e5e7eb; margin: 20px 0; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .info-box label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; }
  .info-box p { margin: 4px 0 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #6c63ff; color: #fff; padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; }
  td { padding: 12px 16px; border-bottom: 1px solid #f3f4f6; }
  tr:nth-child(even) td { background: #fafafa; }
  .totals { display: flex; justify-content: flex-end; }
  .totals-table { width: 300px; }
  .totals-table td { border: none; padding: 6px 16px; }
  .totals-table .total-row td { font-weight: 700; font-size: 16px; background: #f5f3ff; color: #6c63ff; }
  .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px; }
  .status-badge { display: inline-block; background: #fef3c7; color: #d97706; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
</style>
</head>
<body>
<div class="header">
  <div class="logo-area">
    <h1>ViyanMedAssist</h1>
    <p>Pharmacy Management System</p>
  </div>
  <div class="po-meta">
    <div class="po-number">PURCHASE ORDER</div>
    <p><strong>#${poNumber}</strong></p>
    <p>Date: ${createdAt}</p>
    <span class="status-badge">${order.status}</span>
  </div>
</div>
<hr class="divider">
<div class="info-grid">
  <div class="info-box">
    <label>Supplier</label>
    <p>${supplier}</p>
  </div>
  <div class="info-box">
    <label>Purchase Order Number</label>
    <p>${poNumber}</p>
  </div>
  <div class="info-box">
    <label>Order Date</label>
    <p>${createdAt}</p>
  </div>
  <div class="info-box">
    <label>Status</label>
    <p>${order.status}</p>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Medicine</th>
      <th>Qty</th>
      <th>Unit Price</th>
      <th>GST</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  <table class="totals-table">
    <tr><td>Subtotal</td><td>&#8377;${Number(order.subtotal ?? 0).toFixed(2)}</td></tr>
    <tr><td>GST</td><td>&#8377;${Number(order.gstAmount ?? 0).toFixed(2)}</td></tr>
    <tr class="total-row"><td>Total Amount</td><td>&#8377;${Number(order.totalAmount ?? 0).toFixed(2)}</td></tr>
  </table>
</div>
${order.notes ? `<p style="color:#6b7280;font-size:12px;margin-top:24px;"><strong>Notes:</strong> ${order.notes}</p>` : ''}
<div class="footer">
  <p>Generated by ViyanMedAssist &bull; Purchase Order ${poNumber}</p>
</div>
</body>
</html>`;

      return reply
        .header('Content-Type', 'text/html; charset=utf-8')
        .header('Content-Disposition', `inline; filename="${poNumber}.html"`)
        .send(html);
    } catch (error) {
      logger.error({ error, id, tenantId }, 'Failed to generate PO PDF');
      return reply.code(500).send({ success: false, error: 'Failed to generate purchase order PDF' });
    }
  }
}

export default new PurchaseOrderFastifyController();
