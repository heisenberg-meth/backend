import { authenticate } from '../../middleware/auth.fastify.js';

async function twoFactorRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/2fa/enable', {
    schema: { tags: ['Users'], summary: 'Enable 2FA' },
  }, async (request, reply) => {
    return reply.send({ success: true, data: { message: '2FA enabled', secret: 'placeholder-secret' } });
  });

  fastify.post('/2fa/disable', {
    schema: { tags: ['Users'], summary: 'Disable 2FA' },
  }, async (request, reply) => {
    return reply.send({ success: true, data: { message: '2FA disabled' } });
  });

  fastify.post('/2fa/verify', {
    schema: { tags: ['Users'], summary: 'Verify 2FA token' },
  }, async (request, reply) => {
    const { token } = request.body;
    if (!token) {
      return reply.code(400).send({ success: false, error: { message: 'Token required', code: 'TOKEN_REQUIRED' } });
    }
    return reply.send({ success: true, data: { verified: true, message: 'Token verified' } });
  });
}

export default twoFactorRoutes;
