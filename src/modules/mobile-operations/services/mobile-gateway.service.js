import prisma from '../../../config/prisma.js';

class MobileGatewayService {
  /**
   * Register a new mobile device for push notifications and sync
   */
  async registerDevice(userId, deviceData) {
    return await prisma.mobileDevice.upsert({
      where: { id: deviceData.deviceId || 'placeholder_id' }, // Simplified upsert
      update: { pushToken: deviceData.pushToken, lastActiveAt: new Date() },
      create: {
        userId,
        deviceId: deviceData.deviceId,
        platform: deviceData.platform,
        pushToken: deviceData.pushToken,
      },
    });
  }

  /**
   * Optimized data payload for mobile syncing (minimal fields)
   */
  async getSyncSnapshot(tenantId, branchId) {
    return {
      medicines: await prisma.medicine.findMany({ where: { tenantId }, take: 100, select: { id: true, name: true, unitPrice: true } }),
      stock: await prisma.inventoryBatch.findMany({ where: { branchId }, take: 100 })
    };
  }
}

export default new MobileGatewayService();
