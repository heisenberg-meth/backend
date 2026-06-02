class AnalyticsService {
  async getDashboardStats() {
    return {
      totalStock: 0,
      expiringSoon: 0,
      outOfStock: 0,
    };
  }

  async getInventoryDistribution() {
    return [];
  }
}

export default new AnalyticsService();
