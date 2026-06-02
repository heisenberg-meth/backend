import { initAlertWorker } from './workers/alert.worker.js';

export const initAlertsModule = () => {
  initAlertWorker();
};
