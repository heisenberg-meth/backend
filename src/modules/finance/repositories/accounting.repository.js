import prisma from "../../../config/prisma.js";

class AccountingRepository {
  // Expenses
  async createExpense(data) {
    return prisma.expense.create({
      data,
      include: { category: true }
    });
  }

  async findExpenses(tenantId, filters = {}) {
    const { fromDate, toDate, categoryId, branchId } = filters;
    return prisma.expense.findMany({
      where: {
        tenantId,
        deletedAt: null,
        expenseDate: {
          gte: fromDate ? new Date(fromDate) : undefined,
          lte: toDate ? new Date(toDate) : undefined
        },
        categoryId,
        branchId
      },
      include: { category: true, user: { select: { fullName: true } } },
      orderBy: { expenseDate: 'desc' }
    });
  }

  async findExpenseById(id, tenantId) {
    return prisma.expense.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { category: true },
    });
  }

  async updateExpense(id, tenantId, data) {
    return prisma.expense.update({
      where: { id, tenantId, deletedAt: null },
      data
    });
  }

  async deleteExpense(id, tenantId) {
    // Soft delete — NEVER hard delete financial records
    return prisma.expense.update({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date() }
    });
  }

  // Categories
  async createCategory(data) {
    return prisma.expenseCategory.create({ data });
  }

  async findCategories(tenantId) {
    return prisma.expenseCategory.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' }
    });
  }

  // GST & HSN Summaries
  async upsertGstSummary(tenantId, reportMonth, data) {
    const month = new Date(reportMonth);
    month.setDate(1);
    month.setHours(0, 0, 0, 0);

    return prisma.gstSummary.upsert({
      where: {
        tenantId_reportMonth: { tenantId, reportMonth: month }
      },
      update: data,
      create: { tenantId, reportMonth: month, ...data }
    });
  }

  async findGstSummaries(tenantId) {
    return prisma.gstSummary.findMany({
      where: { tenantId },
      orderBy: { reportMonth: 'desc' }
    });
  }

  // Journal Entries
  async createJournalEntry(data) {
    return prisma.journalEntry.create({ data });
  }

  async findJournalEntries(tenantId, limit = 50) {
    return prisma.journalEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}

export default new AccountingRepository();
