import { COMMUNICATION_TEMPLATES } from '../constants/templates.js';
import logger from '../../../shared/utils/logger.js';

class TemplateSelectorService {
  getTemplate(templateName) {
    const template = COMMUNICATION_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Unknown communication template: ${templateName}`);
    }
    return template;
  }

  isChannelSupported(templateName, channel) {
    const template = this.getTemplate(templateName);
    return template.channels.includes(channel);
  }

  selectBestChannel(patient, templateName, preferredChannel) {
    if (preferredChannel && this.isChannelSupported(templateName, preferredChannel)) {
      if (preferredChannel === 'WHATSAPP' && patient.allowWhatsapp !== false)
        return preferredChannel;
      if (preferredChannel === 'SMS' && patient.allowSms !== false) return preferredChannel;
      if (preferredChannel === 'EMAIL' && patient.email) return preferredChannel;
    }

    if (
      patient.allowWhatsapp !== false &&
      patient.phone &&
      this.isChannelSupported(templateName, 'WHATSAPP')
    ) {
      return 'WHATSAPP';
    }
    if (
      patient.allowSms !== false &&
      patient.phone &&
      this.isChannelSupported(templateName, 'SMS')
    ) {
      return 'SMS';
    }
    if (patient.email && this.isChannelSupported(templateName, 'EMAIL')) {
      return 'EMAIL';
    }

    logger.warn({ patientId: patient.id, templateName }, 'No suitable channel for patient');
    return null;
  }

  buildFallbackChain(patient, templateName, primaryChannel) {
    const chain = [primaryChannel];
    const template = this.getTemplate(templateName);
    const supported = template.channels || [];

    const order = supported.filter((ch) => ch !== primaryChannel);
    for (const ch of order) {
      if (ch === 'WHATSAPP' && patient.allowWhatsapp !== false && patient.phone) chain.push(ch);
      else if (ch === 'SMS' && patient.allowSms !== false && patient.phone) chain.push(ch);
      else if (ch === 'EMAIL' && patient.email) chain.push(ch);
    }

    return chain;
  }
}

export default new TemplateSelectorService();
