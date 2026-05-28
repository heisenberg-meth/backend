import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import redisClient from './redis.js';
import logger from '../shared/utils/logger.js';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: '*', // Adjust as needed for security
      methods: ['GET', 'POST'],
    },
  });

  const pubClient = redisClient.duplicate();
  const subClient = redisClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  io.on('connection', (socket) => {
    logger.info(`[SOCKET] Client connected: ${socket.id}`);

    socket.on('join-tenant', (tenantId) => {
      socket.join(`tenant:${tenantId}`);
      logger.info(`[SOCKET] Client ${socket.id} joined tenant: ${tenantId}`);
    });

    socket.on('join-branch', (branchId) => {
      socket.join(`branch:${branchId}`);
      logger.info(`[SOCKET] Client ${socket.id} joined branch: ${branchId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`[SOCKET] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};
