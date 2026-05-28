import { pdfWorker, shareWorker } from './workers/billing.worker.js';
import { registerWorker } from '../../config/queue-registry.js';

export const initBillingModule = () => {
  registerWorker(pdfWorker);
  registerWorker(shareWorker);
};

