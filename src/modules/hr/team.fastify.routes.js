import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import prisma from '../../config/prisma.js';

async function teamRoutes(fastify) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireTenant);

  fastify.get('/', async (request) => {
    const team = await prisma.user.findMany({
      where: { tenantId: request.tenantId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatar: true,
      },
    });
    // Map id to _id for frontend compatibility if needed, or just return as is
    return team.map(u => ({ ...u, _id: u.id }));
  });

  fastify.post('/', async (request) => {
    const { email, password, fullName, role } = request.body;
    const user = await prisma.user.create({
      data: {
        email,
        password, // Should be hashed in a real app, but following existing patterns
        fullName,
        role: role.toUpperCase(),
        tenantId: request.tenantId,
      },
    });
    return { ...user, _id: user.id };
  });

  fastify.put('/:id', async (request) => {
    const { id } = request.params;
    const user = await prisma.user.update({
      where: { id, tenantId: request.tenantId },
      data: request.body
    });
    return { ...user, _id: user.id };
  });

  fastify.post('/avatar', async () => {
    // Mock upload for now since @fastify/multipart is not installed
    return { avatarUrl: 'https://ui-avatars.com/api/?name=User&background=4FDBC8&color=0A0F1C' };
  });

  fastify.delete('/:id', async (request) => {
    const { id } = request.params;
    // Soft delete — NEVER hard delete user records
    await prisma.user.update({
      where: { id, tenantId: request.tenantId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return { message: 'Member deactivated (soft delete)' };
  });
}

export default teamRoutes;
