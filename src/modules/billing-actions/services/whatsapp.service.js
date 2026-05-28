import logger from '../../../shared/utils/logger.js';

class WhatsappService {
  constructor() {
    this.provider = process.env.WHATSAPP_PROVIDER || 'mock';
    this.templateName = process.env.WHATSAPP_INVOICE_TEMPLATE || 'invoice_delivery';
  }

  async sendInvoice(recipient, invoiceData, pdfUrl) {
    logger.info(`[WhatsApp] Sending invoice to ${recipient} via ${this.provider}`);

    if (this.provider === 'mock') {
      return this.sendMock(recipient, invoiceData);
    }

    if (this.provider === 'twilio') {
      return this.sendViaTwilio(recipient, invoiceData, pdfUrl);
    }

    if (this.provider === 'meta') {
      return this.sendViaMeta(recipient, invoiceData, pdfUrl);
    }

    throw new Error(`Unknown WhatsApp provider: ${this.provider}`);
  }

  async sendMock() {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      success: true,
      messageId: `mock-wa-${Date.now()}`,
      provider: 'mock',
    };
  }

  async sendViaTwilio(recipient, invoiceData, pdfUrl) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio credentials not configured');
    }

    const message = `Your invoice ${invoiceData.invoiceNumber} is ready. Amount: ₹${invoiceData.totalAmount}. ${pdfUrl || ''}`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          From: `whatsapp:${fromNumber}`,
          To: `whatsapp:${recipient}`,
          Body: message,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio API error: ${response.status} - ${error}`);
    }

    const result = await response.json();

    return {
      success: true,
      messageId: result.sid,
      provider: 'twilio',
    };
  }

  async sendViaMeta(recipient, invoiceData, pdfUrl) {
    const accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

    if (!accessToken || !phoneNumberId) {
      throw new Error('Meta WhatsApp credentials not configured');
    }

    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipient,
        type: 'template',
        template: {
          name: this.templateName,
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: invoiceData.invoiceNumber },
                { type: 'text', text: `₹${invoiceData.totalAmount}` },
                { type: 'text', text: pdfUrl || 'N/A' },
              ],
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Meta WhatsApp API error: ${response.status} - ${error}`);
    }

    const result = await response.json();

    return {
      success: true,
      messageId: result.messages?.[0]?.id,
      provider: 'meta',
    };
  }

  async sendPaymentConfirmation(recipient, invoiceData) {
    const message = `Payment received for invoice ${invoiceData.invoiceNumber}. Amount: ₹${invoiceData.totalAmount}. Thank you!`;

    return this.sendText(recipient, message);
  }

  async sendText(recipient, message) {
    if (this.provider === 'mock') {
      return this.sendMock(recipient, { message });
    }

    if (this.provider === 'twilio') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          },
          body: new URLSearchParams({
            From: `whatsapp:${fromNumber}`,
            To: `whatsapp:${recipient}`,
            Body: message,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Twilio API error: ${response.status}`);
      }

      const result = await response.json();
      return { success: true, messageId: result.sid };
    }

    throw new Error(`Text sending not supported for provider: ${this.provider}`);
  }
}

export default new WhatsappService();
