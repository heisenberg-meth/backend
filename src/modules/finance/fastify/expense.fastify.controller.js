import expenseService from '../services/expense.service.js';

class ExpenseFastifyController {
  async getExpenses(request, reply) {
    const expenses = await expenseService.getExpenses(request.tenantId, request.query);
    return reply.send(expenses);
  }

  async createExpense(request, reply) {
    const expense = await expenseService.createExpense(
      request.tenantId,
      request.body,
      request.user.id,
    );
    return reply.code(201).send(expense);
  }

  async updateExpense(request, reply) {
    const expense = await expenseService.updateExpense(
      request.params.id,
      request.tenantId,
      request.body,
    );
    return reply.send(expense);
  }

  async deleteExpense(request, reply) {
    await expenseService.deleteExpense(request.params.id, request.tenantId);
    return reply.send({ message: 'Expense deleted successfully' });
  }

  async getCategories(request, reply) {
    const categories = await expenseService.getCategories(request.tenantId);
    return reply.send(categories);
  }

  async createCategory(request, reply) {
    const category = await expenseService.createCategory(request.tenantId, request.body);
    return reply.code(201).send(category);
  }
}

export default new ExpenseFastifyController();
