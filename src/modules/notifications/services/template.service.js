import prisma from '../../../config/prisma.js';

class TemplateService {
  async getTemplate(tenantId, templateName, channel) {
    // Try to get tenant-specific template first
    let template = await prisma.notificationTemplate.findFirst({
      where: {
        tenantId,
        templateName,
        channel,
      },
    });

    // Fallback to global template (tenantId = null)
    if (!template) {
      template = await prisma.notificationTemplate.findFirst({
        where: {
          tenantId: null,
          templateName,
          channel,
        },
      });
    }

    if (!template) {
      throw new Error(`Template not found: ${templateName} for channel ${channel}`);
    }

    return template;
  }

  render(templateBody, variables) {
    if (!variables) return templateBody;

    let rendered = templateBody;
    for (const [key, value] of Object.entries(variables)) {
      // Replace all occurrences of {{key}} with value
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, value);
    }
    return rendered;
  }

  async renderTemplate(tenantId, templateName, channel, variables) {
    const template = await this.getTemplate(tenantId, templateName, channel);
    return this.render(template.templateBody, variables);
  }
}

export default new TemplateService();
