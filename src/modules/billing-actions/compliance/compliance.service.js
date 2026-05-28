import prisma from '../../../config/prisma.js';
class ComplianceService {
  async validateGstCompliance(tenantId, invoice) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { gstNumber: true, state: true },
    });

    const issues = [];

    if (!tenant?.gstNumber) {
      issues.push('Tenant GSTIN not configured');
    }

    if (!invoice.items?.length) {
      issues.push('Invoice has no items');
    }

    for (const item of invoice.items || []) {
      if (!item.batch?.batchNumber) {
        issues.push(`Item ${item.medicine?.name || 'unknown'} missing batch number`);
      }
      if (!item.medicine?.hsnCode) {
        issues.push(`Item ${item.medicine?.name || 'unknown'} missing HSN code`);
      }
    }

    return {
      isCompliant: issues.length === 0,
      issues,
      tenantGstin: tenant?.gstNumber,
    };
  }

  async validateDrugLicense(invoice) {
    if (!invoice.items?.length) return { isCompliant: true, issues: [] };

    const scheduleMismatches = [];

    for (const item of invoice.items) {
      const schedule = item.medicine?.scheduleType;
      if (schedule === 'H' || schedule === 'H1' || schedule === 'X') {
        if (!invoice.prescriptionId && schedule !== 'H') {
          scheduleMismatches.push(
            `Schedule ${schedule} drug "${item.medicine?.name}" requires prescription`
          );
        }
      }
    }

    return {
      isCompliant: scheduleMismatches.length === 0,
      issues: scheduleMismatches,
    };
  }

  async generateComplianceReport(tenantId, startDate, endDate) {
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        items: {
          include: {
            medicine: true,
            batch: true,
          },
        },
      },
    });

    const totalInvoices = invoices.length;
    const compliantInvoices = [];
    const nonCompliantInvoices = [];

    for (const invoice of invoices) {
      const gstResult = await this.validateGstCompliance(tenantId, invoice);
      const drugResult = await this.validateDrugLicense(invoice);

      if (gstResult.isCompliant && drugResult.isCompliant) {
        compliantInvoices.push(invoice.id);
      } else {
        nonCompliantInvoices.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          gstIssues: gstResult.issues,
          drugIssues: drugResult.issues,
        });
      }
    }

    return {
      period: { startDate, endDate },
      totalInvoices,
      compliantCount: compliantInvoices.length,
      nonCompliantCount: nonCompliantInvoices.length,
      complianceRate: totalInvoices > 0 ? (compliantInvoices.length / totalInvoices) * 100 : 100,
      nonCompliantInvoices,
    };
  }
}

export default new ComplianceService();
