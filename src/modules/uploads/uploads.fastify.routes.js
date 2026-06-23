import prisma from '../../config/prisma.js';
import { authenticate } from '../../middleware/auth.fastify.js';
import MediaService from '../../shared/services/media.service.js';

async function uploadsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  fastify.post(
    '/avatar',
    {
      schema: {
        tags: ['Uploads'],
        summary: 'Upload user avatar',
      },
    },
    async (request, reply) => {
      try {
        const data = await request.file();
        if (!data) {
          return reply
            .code(400)
            .send({ success: false, error: { message: 'No file uploaded', code: 'NO_FILE' } });
        }

        if (!data.mimetype.startsWith('image/')) {
          return reply.code(400).send({
            success: false,
            error: {
              message: 'Only image files are allowed',
              code: 'INVALID_MIME',
            },
          });
        }

        const chunks = [];
        for await (const chunk of data.file) {
          chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        if (buffer.length > 10 * 1024 * 1024) {
          return reply.code(400).send({
            success: false,
            error: {
              message: 'File must be under 10MB',
              code: 'FILE_TOO_LARGE',
            },
          });
        }

        const relativePath = `/avatars/${request.user.id}`;
        await prisma.user.update({
          where: { id: request.user.id },
          data: {
            avatar: relativePath,
            avatarData: buffer,
            avatarMimeType: data.mimetype,
          },
        });

        const publicUrl = MediaService.generatePublicUrl(relativePath);

        return reply.send({
          success: true,
          data: {
            avatarUrl: publicUrl,
          },
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({
          success: false,
          error: { message: error.message || 'Upload failed', code: 'UPLOAD_ERROR' },
        });
      }
    },
  );
}

export default uploadsRoutes;
