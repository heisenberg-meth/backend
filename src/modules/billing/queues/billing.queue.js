import { Queue } from 'bullmq';
import { getBullRedis } from '../../../config/redis.js';
import { registerQueue } from '../../../config/queue-registry.js';

const isTest = process.env.NODE_ENV === 'test';

const createQueue = (name) => {
  return new Queue(name, {
    connection: getBullRedis(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });
};

export const billingQueues = isTest ? {} : {
  pdf: registerQueue(createQueue('billing_pdf_generation')),
  share: registerQueue(createQueue('billing_invoice_sharing')),
};

class BillingQueueService {
  async queuePdfGeneration(invoiceId, tenantId) {
    return await billingQueues.pdf.add('generate_pdf', { invoiceId, tenantId });
  }

  async queueSharing(invoiceId, tenantId, options) {
    return await billingQueues.share.add('share_invoice', { invoiceId, tenantId, ...options });
  }
}

export default new BillingQueueService();
