import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { authenticate } from '../../middleware/auth.fastify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function uploadsRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/avatar', {
    schema: {
      tags: ['Uploads'],
      summary: 'Upload user avatar',
    },
  }, async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ success: false, error: { message: 'No file uploaded', code: 'NO_FILE' } });
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(data.mimetype)) {
        return reply.code(400).send({ success: false, error: { message: 'Invalid image type. Only JPEG, PNG and WebP allowed.', code: 'INVALID_MIME' } });
      }

      const ext = path.extname(data.filename) || '.jpg';
      const filename = `avatar-${request.user.id}-${crypto.randomUUID()}${ext}`;
      const uploadsDir = path.join(__dirname, '../../../uploads/avatars');
      const filePath = path.join(uploadsDir, filename);

      await fs.mkdir(uploadsDir, { recursive: true });

      const chunks = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length > 2 * 1024 * 1024) {
        return reply.code(400).send({ success: false, error: { message: 'File must be under 2MB', code: 'FILE_TOO_LARGE' } });
      }

      await fs.writeFile(filePath, buffer);

      const avatarUrl = `/avatars/${filename}`;

      await prisma.user.update({
        where: { id: request.user.id },
        data: { avatar: avatarUrl },
      });

      return reply.send({ success: true, data: { avatarUrl } });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ success: false, error: { message: error.message || 'Upload failed', code: 'UPLOAD_ERROR' } });
    }
  });
}

export default uploadsRoutes;
