import accountingRepository from '../repositories/accounting.repository.js';

class ExpenseService {
  async createExpense(tenantId, data, userId) {
    return accountingRepository.createExpense({
      ...data,
      tenantId,
      expenseDate: new Date(data.expenseDate),
      createdBy: userId
    });
  }

  async getExpenses(tenantId, filters) {
    return accountingRepository.findExpenses(tenantId, filters);
  }

  async updateExpense(id, tenantId, data) {
    return accountingRepository.updateExpense(id, tenantId, {
      ...data,
      expenseDate: data.expenseDate ? new Date(data.expenseDate) : undefined
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
