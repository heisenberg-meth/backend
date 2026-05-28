import prisma from '../../../config/prisma.js';

class EpidemiologyService {
  /**
   * Correlate disease outbreaks with medicine demand
   */
  async getOutbreakRecommendations(tenantId, region) {
    // 1. Fetch active outbreak risks
    const outbreaks = await prisma.outbreakPrediction.findMany({
      where: { tenantId, region, outbreakRiskScore: { gte: 0.7 } }
    });

    if (outbreaks.length === 0) return [];

    // 2. Map outbreaks to medicine categories (Intelligence Layer)
    const recommendations = outbreaks.map((o) => ({
      disease: o.diseaseType,
      risk: o.outbreakRiskScore,
      priorityMedicines: this.getRelatedMedicines(o.diseaseType),
    }));

    return recommendations;
  }

  getRelatedMedicines(diseaseType) {
    const correlationMap = {
      'DENGUE': ['ORS', 'Fever Meds', 'Platelet Support'],
      'FLU': ['Antivirals', 'Fever Meds', 'Decongestants']
    };
    return correlationMap[diseaseType] || [];
  }
}

export default new EpidemiologyService();
