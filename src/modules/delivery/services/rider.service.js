import prisma from '../../../config/prisma.js';

class RiderService {
  async registerRider(tenantId, data) {
    return prisma.rider.create({
      data: {
        tenantId,
        fullName: data.fullName,
        phone: data.phone,
        vehicleType: data.vehicleType,
        currentStatus: 'AVAILABLE',
      },
    });
  }

  async getAvailableRiders(tenantId) {
    return prisma.rider.findMany({
      where: { tenantId, currentStatus: 'AVAILABLE' },
    });
  }

  async updateRiderLocation(riderId, lat, lon) {
    return prisma.rider.update({
      where: { id: riderId },
      data: {
        currentLatitude: lat,
        currentLongitude: lon,
        lastActiveAt: new Date(),
      },
    });
  }

  async updateRiderStatus(riderId, status) {
    return prisma.rider.update({
      where: { id: riderId },
      data: { currentStatus: status },
    });
  }

  /**
   * Mock function to find the nearest rider.
   * In a real implementation, this would use PostGIS or Haversine formula in a query.
   */
  async findNearestRider(tenantId) {
    const riders = await this.getAvailableRiders(tenantId);

    if (riders.length === 0) return null;

    // Mock: just return the first available one for MVP
    return riders[0];
  }
}

export default new RiderService();
