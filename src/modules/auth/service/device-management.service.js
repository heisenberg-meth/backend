import prisma from '../../../config/prisma.js';
import sessionService from './session.service.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

class DeviceManagementService {
  /**
   * Retrieves all registered browsers and devices for a user.
   */
  async getUserDevices(userId) {
    const devices = await prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeen: 'desc' },
    });
    return devices;
  }

  /**
   * Revokes a specific device and terminates associated active sessions.
   */
  async revokeDevice(userId, deviceId) {
    const device = await prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      const err = new Error('Device not found');
      err.code = AUTH_ERRORS.VALIDATION_ERROR;
      throw err;
    }

    // Delete device record and browser lock
    await prisma.$transaction(async (tx) => {
      await tx.device.delete({ where: { id: deviceId } });
      await tx.browserLock.deleteMany({ where: { fingerprintId: device.fingerprintId } });
    });

    // Revoke sessions tied to this fingerprint
    await sessionService.revokeUserSessionsByDevice(userId, device.fingerprintId);

    eventBus.publish('DeviceRevoked', {
      userId,
      deviceId,
      fingerprintId: device.fingerprintId,
      timestamp: new Date(),
    });

    logger.info({ userId, deviceId }, 'Device revoked by user');
    return { message: 'Device has been successfully removed and unlinked.' };
  }

  /**
   * Toggles trusted status on a device.
   */
  async updateDeviceTrust(userId, deviceId, isTrusted) {
    const device = await prisma.device.findFirst({
      where: { id: deviceId, userId },
    });

    if (!device) {
      const err = new Error('Device not found');
      err.code = AUTH_ERRORS.VALIDATION_ERROR;
      throw err;
    }

    const trustedUntil = isTrusted ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null;

    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { isTrusted, trustedUntil },
    });

    eventBus.publish('DeviceTrustUpdated', { userId, deviceId, isTrusted, timestamp: new Date() });
    return updated;
  }
}

export default new DeviceManagementService();
