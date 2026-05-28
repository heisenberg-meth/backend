import authController from '../auth/controller/auth.fastify.controller.js';
import { authenticate } from '../../middleware/auth.fastify.js';

async function usersRoutes(fastify) {
  fastify.get(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        tags: ['Users'],
        summary: 'Get current user profile',
      },
    },
    authController.getMe,
  );
}

export default usersRoutes;
