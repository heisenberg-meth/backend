import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaPath = path.resolve(__dirname, '../../../src/config/prisma.js');
const webhookHandlerPath = path.resolve(
  __dirname,
  '../../../src/modules/payments/webhooks/razorpay.webhook.js',
);
const paymentConfigPath = path.resolve(__dirname, '../../../src/config/payment.config.js');
const paymentLockServicePath = path.resolve(
  __dirname,
  '../../../src/modules/payments/services/payment.lock.service.js',
);

const secret = 'test_secret';

const mockPaymentWebhookFindUnique = jest.fn();
const mockPaymentWebhookCreate = jest.fn();

jest.unstable_mockModule(prismaPath, () => ({
  default: {
    paymentWebhook: {
      findUnique: mockPaymentWebhookFindUnique,
      create: mockPaymentWebhookCreate,
    },
    payment: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      updateMany: jest.fn(),
    },
    paymentAuditLog: {
      create: jest.fn(),
    },
  },
}));

jest.unstable_mockModule(paymentConfigPath, () => ({
  getConfig: () => ({
    webhookSecret: secret,
  }),
}));

jest.unstable_mockModule(paymentLockServicePath, () => ({
  default: {
    executeWithLock: jest.fn(async (key, fn) => fn()),
  },
}));

const { default: webhookHandler } = await import(webhookHandlerPath);

describe('Webhook Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should verify valid signature', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured', id: 'pay_123' });
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    const isValid = webhookHandler.verifySignature(rawBody, signature);
    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured', id: 'pay_123' });
    const signature =
      'invalid_signature_hash_1234567890123456789012345678901234567890123456789012345678901234';

    const isValid = webhookHandler.verifySignature(rawBody, signature);
    expect(isValid).toBe(false);
  });

  it('should ignore duplicate webhook processing', async () => {
    const payload = {
      event_id: 'evt_123',
      payload: { payment: { entity: { id: 'pay_dup', order_id: 'order_123' } } },
    };

    mockPaymentWebhookFindUnique.mockResolvedValue({
      id: 'wh_1',
      idempotencyKey: 'webhook:evt_123:pay_dup',
    });

    const result = await webhookHandler.processWebhook('payment.captured', payload);
    expect(result).toEqual({ received: true, ignored: true });
  });
});
