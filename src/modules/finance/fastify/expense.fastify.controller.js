import expenseService from '../services/expense.service.js';
import { createExpenseSchema, updateExpenseSchema } from '../validators/expense.validator.js';
import { ZodError } from 'zod';

class ExpenseFastifyController {
  async getExpenses(request, reply) {
    try {
      const expenses = await expenseService.getExpenses(request.tenantId, request.query);
      return reply.send({
        success: true,
        data: { expenses },
        expenses,
      });
    } catch (error) {
      request.log.error({ err: error, endpoint: 'getExpenses' }, 'Error fetching expenses');
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async createExpense(request, reply) {
    try {
      request.log.info({ payload: request.body }, 'Incoming Expense Payload');
      const { body: validatedBody } = createExpenseSchema.parse({ body: request.body });

      const expense = await expenseService.createExpense(
        request.tenantId,
        validatedBody,
        request.user?.id || request.userId,
      );
      return reply.code(201).send({
        success: true,
        message: 'Expense created successfully',
        data: expense,
        expense,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        request.log.warn({ errors: error.issues }, 'Expense Validation Failed');
        const errors = error.issues.map(issue => ({
          field: issue.path.filter(p => p !== 'body').join('.'),
          message: issue.message,
        }));
        return reply.code(400).send({
          success: false,
          message: 'Validation failed',
          error: {
            message: errors[0]?.message || 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: errors,
          },
          errors,
        });
      }
      request.log.error({ err: error }, 'Error creating expense');
      const statusCode = error.statusCode || 400;
      return reply.code(statusCode).send({
        success: false,
        message: error.message || 'Failed to create expense',
        error: {
          message: error.message,
          code: error.code || 'EXPENSE_CREATION_FAILED',
          details: error.validation || [{ field: 'general', message: error.message }],
        },
        errors: error.validation || [{ field: 'general', message: error.message }],
      });
    }
  }

  async updateExpense(request, reply) {
    try {
      const { body: validatedBody } = updateExpenseSchema.parse({ body: request.body });
      const expense = await expenseService.updateExpense(
        request.params.id,
        request.tenantId,
        validatedBody,
      );
      return reply.send({
        success: true,
        message: 'Expense updated successfully',
        data: expense,
        expense,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.issues.map(issue => ({
          field: issue.path.filter(p => p !== 'body').join('.'),
          message: issue.message,
        }));
        return reply.code(400).send({
          success: false,
          message: 'Validation failed',
          error: { message: errors[0]?.message || 'Validation failed', code: 'VALIDATION_ERROR', details: errors },
          errors,
        });
      }
      request.log.error({ err: error }, 'Error updating expense');
      const statusCode = error.statusCode || 400;
      return reply.code(statusCode).send({
        success: false,
        message: error.message,
        error: { message: error.message, code: 'EXPENSE_UPDATE_FAILED' },
      });
    }
  }

  async deleteExpense(request, reply) {
    try {
      await expenseService.deleteExpense(request.params.id, request.tenantId);
      return reply.send({ success: true, message: 'Expense deleted successfully' });
    } catch (error) {
      request.log.error({ err: error }, 'Error deleting expense');
      return reply.code(error.statusCode || 500).send({ success: false, message: error.message });
    }
  }

  async getCategories(request, reply) {
    try {
      const categories = await expenseService.getCategories(request.tenantId);
      return reply.send({ success: true, data: categories });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async createCategory(request, reply) {
    try {
      const category = await expenseService.createCategory(request.tenantId, request.body);
      return reply.code(201).send({ success: true, data: category });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }
}

export default new ExpenseFastifyController();
