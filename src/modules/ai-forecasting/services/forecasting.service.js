import axios from 'axios';
import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class ForecastingService {
  /**
   * Request a forecast from the external AI Engine
   */
  async getMedicineForecast(tenantId, medicineId, branchId) {
    try {
      const response = await axios.post(`${process.env.AI_ENGINE_URL}/forecast`, {
        tenant_id: tenantId,
        medicine_id: medicineId,
        branch_id: branchId,
      });

      const { forecast, confidence, model } = response.data;

      // Store in DB
      await prisma.demandForecast.create({
        data: {
          tenantId,
          medicineId,
          branchId,
          predictedQuantity: forecast,
          confidenceScore: confidence,
          modelVersion: model,
          forecastDate: new Date(),
        },
      });

      return { forecast, confidence };
    } catch (err) {
      logger.error({ err }, '[FORECASTING_SERVICE] Failed to fetch/store forecast');
      throw err;
    }
  }
}

export default new ForecastingService();
