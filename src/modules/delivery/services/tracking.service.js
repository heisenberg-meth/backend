import prisma from '../../../config/prisma.js';
import { getIO } from '../../../config/socket.js';
import redisClient from '../../../config/redis.js';

class TrackingService {
  async updateLocation(riderId, tenantId, lat, lon) {
    const locationData = { lat, lon, timestamp: new Date() };

    const redisKey = `rider:location:${riderId}`;
    await redisClient.set(redisKey, JSON.stringify(locationData), 'EX', 3600);

    await prisma.rider.update({
      where: { id: riderId },
      data: {
        currentLatitude: lat,
        currentLongitude: lon,
        lastActiveAt: new Date(),
      },
    });

    const io = getIO();

    const activeDeliveries = await prisma.delivery.findMany({
      where: {
        riderId,
        deliveryStatus: { in: ['PICKED_UP', 'OUT_FOR_DELIVERY'] },
      },
      select: { orderId: true },
    });

    io.to(`tenant:${tenantId}`).emit('rider-location-update', {
      riderId,
      ...locationData,
    });

    activeDeliveries.forEach((d) => {
      io.to(`order:${d.orderId}`).emit('tracking-update', locationData);
    });

    return locationData;
  }

  async getRiderLocation(riderId) {
    const redisKey = `rider:location:${riderId}`;
    const cached = await redisClient.get(redisKey);
    if (cached) return JSON.parse(cached);

    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
      select: { currentLatitude: true, currentLongitude: true, lastActiveAt: true },
    });

    return {
      lat: rider.currentLatitude,
      lon: rider.currentLongitude,
      timestamp: rider.lastActiveAt,
    };
  }

  async calculateETA() {
    return 15 + 1 * 2;
  }
}

export default new TrackingService();
