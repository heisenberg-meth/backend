import categoryService from '../services/category.service.js';

class CategoryFastifyController {
  async getCategories(request, reply) {
    try {
      const categories = await categoryService.getCategories(request.tenantId);
      return reply.send({ success: true, data: categories });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }

  async getCategoryById(request, reply) {
    try {
      const category = await categoryService.getCategoryById(request.params.id, request.tenantId);
      return reply.send({ success: true, data: category });
    } catch (error) {
      return reply.code(404).send({ success: false, message: error.message });
    }
  }

  async createCategory(request, reply) {
    try {
      const category = await categoryService.createCategory(request.body, request.tenantId, request.user?.id);
      return reply.code(201).send({ success: true, data: category });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async updateCategory(request, reply) {
    try {
      const category = await categoryService.updateCategory(request.params.id, request.tenantId, request.body, request.user?.id);
      return reply.send({ success: true, data: category });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async deleteCategory(request, reply) {
    try {
      await categoryService.deleteCategory(request.params.id, request.tenantId, request.user?.id);
      return reply.send({ success: true, message: 'Category deleted successfully' });
    } catch (error) {
      return reply.code(400).send({ success: false, message: error.message });
    }
  }

  async getCategoryAnalytics(request, reply) {
    try {
      const analytics = await categoryService.getCategoryAnalytics(request.tenantId);
      return reply.send({ success: true, data: analytics });
    } catch (error) {
      return reply.code(500).send({ success: false, message: error.message });
    }
  }
}

export default new CategoryFastifyController();
