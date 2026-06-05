import prisma from '../../../config/prisma.js';

class TemplateController {
  async createTemplate(req, reply) {
    const { tenantId } = req.user;
    const { templateName, channel, templateBody, variables } = req.body;

    try {
      const template = await prisma.notificationTemplate.create({
        data: {
          tenantId,
          templateName,
          channel,
          templateBody,
          variables,
        },
      });
      return reply.code(201).send(template);
    } catch (error) {
      req.log.error(error);
      throw error;
    }
  }

  async getTemplates(req, reply) {
    const { tenantId } = req.user;

    try {
      const templates = await prisma.notificationTemplate.findMany({
        where: { tenantId },
      });
      return reply.send(templates);
    } catch (error) {
      req.log.error(error);
      throw error;
    }
  }
}

export default new TemplateController();
