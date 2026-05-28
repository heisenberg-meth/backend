import categoryRepository from '../repository/category.repository.js';

class CategoryService {
  async getCategories(tenantId) {
    return categoryRepository.findAll(tenantId);
  }

  async getCategoryById(id, tenantId) {
    return categoryRepository.findById(id, tenantId);
  }

  async createCategory(tenantId, data) {
    return categoryRepository.create({ ...data, tenantId });
  }

  async updateCategory(id, tenantId, data) {
    return categoryRepository.update(id, tenantId, data);
  }

  async deleteCategory(id, tenantId) {
    return categoryRepository.delete(id, tenantId);
  }
}

export default new CategoryService();
