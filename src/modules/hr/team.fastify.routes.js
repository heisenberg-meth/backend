import bcrypt from 'bcryptjs';
import { authenticate, requireTenant } from '../../middleware/auth.fastify.js';
import { requirePermission } from '../../middleware/permission.fastify.js';
import prisma from '../../config/prisma.js';
import { requireLimit } from '../../middleware/feature.guard.fastify.js';

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
    return team.map((u) => ({ ...u, _id: u.id }));
  });

  fastify.post('/', {
    preHandler: [
      requirePermission('MANAGE_USERS'),
      requireLimit('users', async (req) => {
        return await prisma.user.count({ where: { tenantId: req.tenantId, deletedAt: null } });
      }),
    ],
    handler: async (request) => {
      const { email, password, fullName, role } = request.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          fullName,
          role: role.toUpperCase(),
          tenantId: request.tenantId,
        },
      });
      const { ...safe } = user;
      return { ...safe, _id: safe.id };
    },
  });

  fastify.put('/:id', {
    preHandler: [requirePermission('MANAGE_USERS')],
    handler: async (request) => {
      const { id } = request.params;
      const allowed = {};
      const { fullName, phone, role } = request.body;
      if (fullName !== undefined) allowed.fullName = fullName;
      if (phone !== undefined) allowed.phone = phone;
      if (role !== undefined) allowed.role = role.toUpperCase();
      const user = await prisma.user.update({
        where: { id, tenantId: request.tenantId },
        data: allowed,
      });
      const { ...safe } = user;
      return { ...safe, _id: safe.id };
    },
  });

  fastify.post('/avatar', async () => {
    return { avatarUrl: 'https://ui-avatars.com/api/?name=User&background=4FDBC8&color=0A0F1C' };
  });

  fastify.delete('/:id', {
    preHandler: [requirePermission('MANAGE_USERS')],
    handler: async (request) => {
      const { id } = request.params;
      await prisma.user.update({
        where: { id, tenantId: request.tenantId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      return { message: 'Member deactivated (soft delete)' };
    },
  });
}

export default teamRoutes;
