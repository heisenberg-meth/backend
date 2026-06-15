import { authenticate } from '../../middleware/auth.fastify.js';
import { generateSecret, verifyTOTP } from '../../shared/utils/totp.js';
import prisma from '../../config/prisma.js';
import QRCode from 'qrcode';

async function twoFactorRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  fastify.post(
    '/2fa/enable',
    {
      schema: { tags: ['Users'], summary: 'Enable 2FA and get secret' },
    },
    async (request, reply) => {
      const { userId } = request.user;
      const secret = generateSecret();

      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: secret, twoFactorEnabled: false },
      });

      const appName = 'Viyan Medassist';
      const userEmail = request.user.email || 'user';
      const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(appName)}`;
      const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

      return reply.send({
        success: true,
        data: {
          message: '2FA secret generated. Please verify to enable.',
          secret: secret,
          qrCode: qrCodeUrl,
        },
      });
    },
  );

  fastify.post(
    '/2fa/disable',
    {
      schema: { tags: ['Users'], summary: 'Disable 2FA' },
    },
    async (request, reply) => {
      const { userId } = request.user;

      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: null, twoFactorEnabled: false },
      });

      return reply.send({ success: true, data: { message: '2FA disabled' } });
    },
  );

  fastify.post(
    '/2fa/verify',
    {
      schema: { tags: ['Users'], summary: 'Verify 2FA token' },
    },
    async (request, reply) => {
      const { token } = request.body;
      const { userId } = request.user;

      if (!token) {
        return reply
          .code(400)
          .send({ success: false, error: { message: 'Token required', code: 'TOKEN_REQUIRED' } });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { twoFactorSecret: true, twoFactorEnabled: true },
      });

      if (!user || !user.twoFactorSecret) {
        return reply.code(400).send({
          success: false,
          error: { message: '2FA not initialized', code: '2FA_NOT_INITIALIZED' },
        });
      }

      const isValid = verifyTOTP(token, user.twoFactorSecret);

      if (!isValid) {
        return reply
          .code(400)
          .send({ success: false, error: { message: 'Invalid 2FA token', code: 'INVALID_TOKEN' } });
      }

      // If verifying for the first time, enable it
      if (!user.twoFactorEnabled) {
        await prisma.user.update({
          where: { id: userId },
          data: { twoFactorEnabled: true },
        });
      }

      return reply.send({
        success: true,
        data: { verified: true, message: 'Token verified successfully' },
      });
    },
  );
}

export default twoFactorRoutes;
