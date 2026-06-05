import prisma from '../../config/prisma.js';

async function avatarRoutes(fastify) {
  fastify.get('/:userId', async (request, reply) => {
    const { userId } = request.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        avatarData: true,
        avatarMimeType: true,
      },
    });

    if (!user || !user.avatarData) {
      return reply.code(404).send({
        success: false,
        message: 'Avatar not found',
      });
    }

    reply.type(user.avatarMimeType || 'image/png');

    return reply.send(user.avatarData);
  });
}

export default avatarRoutes;
