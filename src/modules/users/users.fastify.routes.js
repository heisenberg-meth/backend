import authController from '../auth/controller/auth.fastify.controller.js';
import { authenticate } from '../../middleware/auth.fastify.js';

async function usersRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  fastify.get(
    '/me',
    {
      schema: {
        tags: ['Users'],
        summary: 'Get current user profile',
      },
    },
    authController.getMe,
  );

  fastify.put(
    '/profile',
    {
      schema: {
        tags: ['Users'],
        summary: 'Update user profile',
      },
    },
    authController.updateProfile,
  );

  fastify.put(
    '/profile/password',
    {
      schema: {
        tags: ['Users'],
        summary: 'Change user password',
      },
    },
    authController.changePassword,
  );
}

export default usersRoutes;
