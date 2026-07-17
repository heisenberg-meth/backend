import categoryRepository from '../repositories/category.repository.js';
import auditService from '../../audit/service/audit.prisma.service.js';

class CategoryService {
  async getCategories(tenantId) {
    let categories = await categoryRepository.findAll(tenantId);
    
    const defaults = [
      { name: 'Tablets', description: 'Oral tablet medications' },
      { name: 'Capsules', description: 'Oral capsule medications' },
      { name: 'Syrups', description: 'Liquid oral medications' },
      { name: 'Injections', description: 'Intravenous or intramuscular injectables' },
      { name: 'Ointments/Creams', description: 'Topical creams and ointments' },
      { name: 'Drops', description: 'Eye, ear, or nasal drops' },
      { name: 'Inhalers', description: 'Respiratory inhalers and sprays' },
      { name: 'OTC', description: 'Over-the-counter general medicines' },
      { name: 'Food', description: 'Food products and supplements' },
      { name: 'Edibles', description: 'Edibles and medicated candies' },
      { name: 'Energy Drinks', description: 'Energy and nutritional drinks' },
      { name: 'Other', description: 'Other miscellaneous items' },
    ];

    const existingNames = new Set(categories.map((c) => c.name.toLowerCase()));
    let createdAny = false;

    for (const cat of defaults) {
      if (!existingNames.has(cat.name.toLowerCase())) {
        await categoryRepository.create({ ...cat, tenantId });
        createdAny = true;
      }
    }

    if (createdAny) {
      categories = await categoryRepository.findAll(tenantId);
    }

    return categories;
  }

  async getCategoryById(id, tenantId) {
    const category = await categoryRepository.findById(id, tenantId);
    if (!category) throw new Error('Category not found');
    return category;
  }

  async createCategory(data, tenantId, userId) {
    const category = await categoryRepository.create({ ...data, tenantId });

    await auditService.log({
      tenantId,
      userId,
      action: 'CREATE_CATEGORY',
      target: category.name,
      type: 'INVENTORY',
    });

    return category;
  }

  async updateCategory(id, tenantId, data, userId) {
    const category = await categoryRepository.update(id, tenantId, data);

    await auditService.log({
      tenantId,
      userId,
      action: 'UPDATE_CATEGORY',
      target: category.name,
      type: 'INVENTORY',
    });

    return category;
  }

  async deleteCategory(id, tenantId, userId) {
    const category = await categoryRepository.findById(id, tenantId);
    if (!category) throw new Error('Category not found');

    await categoryRepository.softDelete(id, tenantId);

    await auditService.log({
      tenantId,
      userId,
      action: 'DELETE_CATEGORY',
      target: category.name,
      type: 'INVENTORY',
    });
  }

  async getCategoryAnalytics(tenantId) {
    return categoryRepository.getAnalytics(tenantId);
  }
}

export default new CategoryService();
