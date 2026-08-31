import accountingRepository from '../repositories/accounting.repository.js';
import {
  SUPPORTED_EXPENSE_CATEGORIES,
  normalizeCategoryName,
} from '../constants/expense-categories.constant.js';
import aggregationService from '../../reports/services/aggregation.service.js';
import logger from '../../../shared/utils/logger.js';
class ExpenseService {
  async createExpense(tenantId, data, userId) {
    let categoryId = data.categoryId;
    const rawCategoryName = (data.category || data.categoryName || '').trim();
    const categoryName = normalizeCategoryName(rawCategoryName) || rawCategoryName;

    if (!categoryId) {
      if (!categoryName) {
        const err = new Error('Expense category is required and cannot be defaulted');
        err.statusCode = 400;
        err.validation = [{ instancePath: '/category', message: 'Category is required' }];
        throw err;
      }
      let categoryRecord = await accountingRepository.findCategoryByName(tenantId, categoryName);
      if (!categoryRecord) {
        categoryRecord = await accountingRepository.createCategory({
          tenantId,
          name: categoryName,
          description: `${categoryName} expenses`,
        });
      }
      categoryId = categoryRecord.id;
    }

    const title = (
      data.title ||
      data.description ||
      data.notes ||
      `${categoryName || 'General'} Expense`
    ).trim();
    const notes = data.notes || data.description || null;
    const amount = Number(data.amount) || 0;
    if (amount <= 0) {
      const err = new Error('Expense amount must be greater than zero');
      err.statusCode = 400;
      err.validation = [{ instancePath: '/amount', message: 'Amount must be greater than zero' }];
      throw err;
    }

    const rawDate = data.expenseDate || data.date;
    const expenseDate = rawDate ? new Date(rawDate) : new Date();
    if (isNaN(expenseDate.getTime())) {
      const err = new Error('Invalid expense date provided');
      err.statusCode = 400;
      err.validation = [{ instancePath: '/expenseDate', message: 'Invalid expense date' }];
      throw err;
    }

    const paymentMethod = (data.paymentMethod || data.via || 'Cash').trim() || 'Cash';
    const attachmentUrl =
      typeof data.attachmentUrl === 'string'
        ? data.attachmentUrl
        : typeof data.receiptUrl === 'string'
          ? data.receiptUrl
          : typeof data.receipt === 'string'
            ? data.receipt
            : null;

    const created = await accountingRepository.createExpense({
      tenantId,
      categoryId,
      title,
      amount,
      paymentMethod,
      expenseDate,
      invoiceNumber: data.invoiceNumber || null,
      attachmentUrl,
      notes,
      createdBy: userId,
    });

    try {
      const startOfDay = new Date(expenseDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(expenseDate);
      endOfDay.setHours(23, 59, 59, 999);
      await aggregationService.aggregateFinance(tenantId, startOfDay, endOfDay);
    } catch (e) {
      logger.error(e);
    }

    return created;
  }

  async getExpenses(tenantId, filters) {
    return accountingRepository.findExpenses(tenantId, filters);
  }

  async updateExpense(id, tenantId, data) {
    const existing = await accountingRepository.findExpenseById(id, tenantId);
    if (!existing) {
      const err = new Error('Expense not found');
      err.statusCode = 404;
      throw err;
    }

    let categoryId = data.categoryId || existing.categoryId;
    if (data.category && data.category !== existing.category?.name) {
      const rawCategoryName = data.category.trim();
      const categoryName = normalizeCategoryName(rawCategoryName) || rawCategoryName;
      let categoryRecord = await accountingRepository.findCategoryByName(tenantId, categoryName);
      if (!categoryRecord) {
        categoryRecord = await accountingRepository.createCategory({
          tenantId,
          name: categoryName,
          description: `${categoryName} expenses`,
        });
      }
      categoryId = categoryRecord.id;
    }

    const title =
      data.title !== undefined
        ? data.title
        : data.description !== undefined
          ? data.description
          : existing.title;
    const notes =
      data.notes !== undefined
        ? data.notes
        : data.description !== undefined
          ? data.description
          : existing.notes;
    const amount = data.amount !== undefined ? Number(data.amount) : existing.amount;
    const paymentMethod =
      data.paymentMethod !== undefined ? data.paymentMethod || 'Cash' : existing.paymentMethod;
    const expenseDate = data.expenseDate
      ? new Date(data.expenseDate)
      : data.date
        ? new Date(data.date)
        : existing.expenseDate;
    const attachmentUrl =
      data.attachmentUrl !== undefined
        ? data.attachmentUrl
        : data.receiptUrl !== undefined
          ? data.receiptUrl
          : data.receipt !== undefined
            ? typeof data.receipt === 'string'
              ? data.receipt
              : existing.attachmentUrl
            : existing.attachmentUrl;

    const updated = await accountingRepository.updateExpense(id, tenantId, {
      categoryId,
      title,
      notes,
      amount,
      paymentMethod,
      expenseDate,
      attachmentUrl,
      invoiceNumber: data.invoiceNumber !== undefined ? data.invoiceNumber : existing.invoiceNumber,
    });

    try {
      const startOfDay = new Date(expenseDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(expenseDate);
      endOfDay.setHours(23, 59, 59, 999);
      await aggregationService.aggregateFinance(tenantId, startOfDay, endOfDay);
    } catch (e) {
      logger.error(e);
    }

    return updated;
  }

  async deleteExpense(id, tenantId) {
    const [existing, deleted] = await Promise.all([
      accountingRepository.findExpenseById(id, tenantId),
      accountingRepository.deleteExpense(id, tenantId),
    ]);
    if (existing && existing.expenseDate) {
      try {
        const startOfDay = new Date(existing.expenseDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(existing.expenseDate);
        endOfDay.setHours(23, 59, 59, 999);
        await aggregationService.aggregateFinance(tenantId, startOfDay, endOfDay);
      } catch (e) {
        logger.error(e);
      }
    }
    return deleted;
  }

  async getCategories(tenantId) {
    const existingCategories = await accountingRepository.findCategories(tenantId);
    const existingNames = new Set(existingCategories.map((c) => c.name.toLowerCase()));

    for (const catName of SUPPORTED_EXPENSE_CATEGORIES) {
      if (!existingNames.has(catName.toLowerCase())) {
        try {
          await accountingRepository.createCategory({
            tenantId,
            name: catName,
            description: `${catName} expenses`,
          });
        } catch (err) {
          logger.error(err);
        }
      }
    }
    return accountingRepository.findCategories(tenantId);
  }

  async createCategory(tenantId, data) {
    const rawName = (data.name || '').trim();
    const name = normalizeCategoryName(rawName) || rawName;
    return accountingRepository.createCategory({
      ...data,
      name,
      tenantId,
    });
  }
}

export default new ExpenseService();
