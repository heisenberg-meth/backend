import reportService from '../services/report.service.js';
import expiryReportService from '../services/expiry_report.service.js';
import exportService from '../services/export.service.js';
import aggregationService from '../services/aggregation.service.js';
import { success, error } from '../../../shared/helpers/response.js';
import logger from '../../../shared/utils/logger.js';

class ReportFastifyController {
  async getSalesReport(request, reply) {
    const startTime = Date.now();
    try {
      const { from, to } = request.query;
      const data = await reportService.getSalesReport(request.tenantId, from, to);
      return reply.send(success(data));
    } catch (err) {
      logger.error(
        {
          err,
          requestId: request.id,
          route: request.url,
          tenantId: request.tenantId,
          queryParams: request.query,
          duration: Date.now() - startTime,
        },
        'Get sales report failed',
      );
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async getPurchaseReport(request, reply) {
    const startTime = Date.now();
    try {
      const { from, to } = request.query;
      const data = await reportService.getPurchaseReport(request.tenantId, from, to);
      return reply.send(success(data));
    } catch (err) {
      logger.error(
        {
          err,
          requestId: request.id,
          route: request.url,
          tenantId: request.tenantId,
          queryParams: request.query,
          duration: Date.now() - startTime,
        },
        'Get purchase report failed',
      );
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async getFinanceReport(request, reply) {
    const startTime = Date.now();
    try {
      const { from, to } = request.query;
      const data = await reportService.getFinanceReport(request.tenantId, from, to);
      return reply.send(success(data));
    } catch (err) {
      logger.error(
        {
          err,
          requestId: request.id,
          route: request.url,
          tenantId: request.tenantId,
          queryParams: request.query,
          duration: Date.now() - startTime,
        },
        'Get finance report failed',
      );
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async getExpiryReport(request, reply) {
    const startTime = Date.now();
    try {
      const { days } = request.query;
      const data = await expiryReportService.getExpiryReport(
        request.tenantId,
        parseInt(days) || 30,
      );
      return reply.send(success(data));
    } catch (err) {
      logger.error(
        {
          err,
          requestId: request.id,
          route: request.url,
          tenantId: request.tenantId,
          queryParams: request.query,
          duration: Date.now() - startTime,
        },
        'Get expiry report failed',
      );
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async exportSalesReport(request, reply) {
    const startTime = Date.now();
    try {
      const { from, to, format } = request.query;
      const data = await reportService.getSalesReport(request.tenantId, from, to);

      const columns = [
        { header: 'Date', key: 'salesDate' },
        { header: 'Total Sales', key: 'totalSales' },
        { header: 'Invoices', key: 'totalInvoices' },
        { header: 'Items Sold', key: 'totalItemsSold' },
        { header: 'GST', key: 'totalGst' },
      ];

      if (format === 'excel') {
        const buffer = await exportService.exportToExcel(data, columns, 'Sales Report');
        return reply
          .header(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          )
          .header('Content-Disposition', 'attachment; filename=sales-report.xlsx')
          .send(buffer);
      }

      const pdfBuffer = await exportService.exportToPdf('Sales Report', data, columns);
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', 'attachment; filename=sales-report.pdf')
        .send(pdfBuffer);
    } catch (err) {
      logger.error(
        {
          err,
          requestId: request.id,
          route: request.url,
          tenantId: request.tenantId,
          queryParams: request.query,
          duration: Date.now() - startTime,
        },
        'Export sales report failed',
      );
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async triggerManualAggregation(request, reply) {
    const startTime = Date.now();
    try {
      const { date } = request.body;
      await aggregationService.runDailyAggregation(request.tenantId, date || new Date());
      await reportService.invalidateCache(request.tenantId);
      return reply.send(success({ message: 'Aggregation completed successfully' }));
    } catch (err) {
      logger.error(
        {
          err,
          requestId: request.id,
          route: request.url,
          tenantId: request.tenantId,
          body: request.body,
          duration: Date.now() - startTime,
        },
        'Manual aggregation failed',
      );
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }

  async reaggregateRange(request, reply) {
    const startTime = Date.now();
    try {
      const { from, to } = request.body;
      if (!from || !to) {
        return reply.code(400).send(error('from and to dates are required', 'VALIDATION_ERROR'));
      }
      const fromDate = new Date(from);
      fromDate.setHours(0, 0, 0, 0);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);

      let current = new Date(fromDate);
      const results = [];
      while (current <= toDate) {
        try {
          await aggregationService.runDailyAggregation(request.tenantId, current);
          results.push(current.toISOString().split('T')[0]);
        } catch (err) {
          logger.error({ err, date: current, tenantId: request.tenantId }, 'Reaggregate date failed');
        }
        current.setDate(current.getDate() + 1);
      }

      await reportService.invalidateCache(request.tenantId);
      return reply.send(success({
        message: `Reaggregation complete for ${results.length} days`,
        dates: results,
      }));
    } catch (err) {
      logger.error(
        {
          err,
          requestId: request.id,
          route: request.url,
          tenantId: request.tenantId,
          body: request.body,
          duration: Date.now() - startTime,
        },
        'Reaggregate range failed',
      );
      return reply.code(500).send(error(err.message, 'INTERNAL_SERVER_ERROR'));
    }
  }
}

export default new ReportFastifyController();
