import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prismaPath = path.resolve(__dirname, '../../../src/config/prisma.js');
const paymentServicePath = path.resolve(
  __dirname,
  '../../../src/modules/payments/services/payment.service.js',
);

const mockPaymentCreate = jest.fn();
const mockPaymentFindUnique = jest.fn();
const mockPaymentUpdate = jest.fn();
const mockSubscriptionFindUnique = jest.fn();
const mockSubscriptionUpdate = jest.fn();
const mockIdempotencyFindUnique = jest.fn();
const mockIdempotencyCreate = jest.fn();

jest.unstable_mockModule(prismaPath, () => ({
  default: {
    payment: {
      create: mockPaymentCreate,
      findUnique: mockPaymentFindUnique,
      update: mockPaymentUpdate,
    },
    subscription: {
      findUnique: mockSubscriptionFindUnique,
      update: mockSubscriptionUpdate,
    },
    idempotencyKey: {
      findUnique: mockIdempotencyFindUnique,
      create: mockIdempotencyCreate,
    },
  },
}));

const { default: paymentService } = await import(paymentServicePath);

describe('Webhook Security Tests', () => {
  const secret = 'test_secret';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore duplicate webhook', async () => {
    const payload = { transactionId: 'txn_dup', status: 'SUCCESS' };
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    mockPaymentFindUnique.mockResolvedValue({
      transactionId: 'txn_dup',
      status: 'SUCCESS',
      tenantId: 'tenant-1',
    });
    mockIdempotencyFindUnique.mockResolvedValue({ idempotencyKey: 'pay_txn_dup_SUCCESS' });

    const result = await paymentService.handleWebhook(payload, signature, secret);
    expect(result.status).toBe('ignored');
  });

  it('should reject invalid signature', async () => {
    const payload = { transactionId: 'txn_inv', status: 'SUCCESS' };
    const signature = 'invalid_signature_hash';

    await expect(paymentService.handleWebhook(payload, signature, secret)).rejects.toThrow(
      'Invalid signature',
    );
  });

  it('should reject replay attacks / modified payloads', async () => {
    const payload = { transactionId: 'txn_1', status: 'SUCCESS', amount: 100 };
    const tamperedPayload = { transactionId: 'txn_1', status: 'SUCCESS', amount: 10 };
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    await expect(paymentService.handleWebhook(tamperedPayload, signature, secret)).rejects.toThrow(
      'Invalid signature',
    );
  });
});
