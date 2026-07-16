import accountingRepository from '../repositories/accounting.repository.js';

class ExpenseService {
  async createExpense(tenantId, data, userId) {
    let categoryId = data.categoryId;
    const categoryName = (data.category || data.categoryName || 'General').trim();

    if (!categoryId) {
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
      `${categoryName} Expense`
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

    return accountingRepository.createExpense({
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
      const categoryName = data.category.trim();
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

    return accountingRepository.updateExpense(id, tenantId, {
      categoryId,
      title,
      notes,
      amount,
      paymentMethod,
      expenseDate,
      attachmentUrl,
      invoiceNumber: data.invoiceNumber !== undefined ? data.invoiceNumber : existing.invoiceNumber,
    });
  }

  async deleteExpense(id, tenantId) {
    return accountingRepository.deleteExpense(id, tenantId);
  }

  async getCategories(tenantId) {
    return accountingRepository.findCategories(tenantId);
  }

  async createCategory(tenantId, data) {
    return accountingRepository.createCategory({
      ...data,
      tenantId,
    });
  }
}

export default new ExpenseService();
