import prisma from '../../../config/prisma.js';
import { getIO } from '../../../config/socket.js';
import redisClient from '../../../config/redis.js';

class TrackingService {
  /**
   * Updates rider location in DB and Redis cache for fast real-time access.
   * Broadcasts to interested parties (patient, branch dashboard).
   */
  async updateLocation(riderId, tenantId, lat, lon) {
    const locationData = { lat, lon, timestamp: new Date() };

    // 1. Cache in Redis (Expiry 1 hour)
    const redisKey = `rider:location:${riderId}`;
    await redisClient.set(redisKey, JSON.stringify(locationData), 'EX', 3600);

    // 2. Update Postgres (Periodic or every update? Let's do every update for MVP)
    await prisma.rider.update({
      where: { id: riderId },
      data: {
        currentLatitude: lat,
        currentLongitude: lon,
        lastActiveAt: new Date(),
      },
    });

    // 3. Broadcast to Socket.io
    const io = getIO();

    // Find active deliveries for this rider to notify patients
    const activeDeliveries = await prisma.delivery.findMany({
      where: {
        riderId,
        deliveryStatus: { in: ['PICKED_UP', 'OUT_FOR_DELIVERY'] },
      },
      select: { orderId: true },
    });

    // Broadcast to tenant/branch dashboard
    io.to(`tenant:${tenantId}`).emit('rider-location-update', {
      riderId,
      ...locationData,
    });

    // Broadcast to specific order tracking rooms
    activeDeliveries.forEach((d) => {
      io.to(`order:${d.orderId}`).emit('tracking-update', locationData);
    });

    return locationData;
  }

  /**
   * Gets current location of a rider, preferring Redis cache.
   */
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

  /**
   * Calculates estimated time of arrival.
   * In a real app, this would call Google Maps Distance Matrix API.
   */
  async calculateETA() {
    return 15 + 1 * 2;
  }
}

export default new TrackingService();
