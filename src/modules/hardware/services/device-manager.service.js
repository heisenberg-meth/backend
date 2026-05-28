import prisma from '../../../config/prisma.js';
import logger from '../../../shared/utils/logger.js';

class DeviceManagerService {
  /**
   * Monitor hardware health and handle heartbeat signals
   */
  async updateDeviceStatus(deviceId, status) {
    return await prisma.hardwareDevice.update({
      where: { id: deviceId },
      data: {
        deviceStatus: status,
        lastSeenAt: new Date(),
      },
    });
  }
  async printInvoice(deviceId) {
    logger.info({ deviceId }, '[HARDWARE_SERVICE] Queuing print job');
    // In production, delegate to a specific driver (ESC/POS or Network driver)
  }
}

export default new DeviceManagerService();
