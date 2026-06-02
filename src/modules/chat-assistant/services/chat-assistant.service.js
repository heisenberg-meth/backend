import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class ChatAssistantService {
  async processQuery(tenantId, query) {
    logger.info({ query }, '[CHAT_ASSISTANT] Processing user query');

    if (query.toLowerCase().includes('low-stock') && query.toLowerCase().includes('diabetic')) {
      return await this.getLowStockDiabeticMedicines(tenantId);
    }

    return {
      message:
        "I'm sorry, I couldn't understand that query. Could you try asking for 'low-stock diabetic medicines'?",
    };
  }

  async getLowStockDiabeticMedicines(tenantId) {
    const medicines = await prisma.medicine.findMany({
      where: {
        tenantId,
        category: { name: { contains: 'Diabetic', mode: 'insensitive' } },
        reorderLevel: { gte: 1 },
      },
      select: { name: true, strength: true, dosageForm: true },
    });

    if (medicines.length === 0) return { message: 'No low-stock diabetic medicines found.' };

    return {
      message: `Found ${medicines.length} low-stock diabetic medicines:`,
      data: medicines,
    };
  }
}

export default new ChatAssistantService();
