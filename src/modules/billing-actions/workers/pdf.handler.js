import pdfGenerationService from '../services/pdf-generation.service.js';
import logger from '../../../shared/utils/logger.js';

export async function processPdfGeneration(data) {
  const { invoiceId, tenantId, options } = data;

  logger.info(`[Worker] Generating PDF for invoice ${invoiceId}`);

  try {
    const result = await pdfGenerationService.generateAndStore(invoiceId, tenantId, options);
    logger.info(`[Worker] PDF generated successfully: ${result.pdfUrl}`);
    return result;
  } catch (err) {
    logger.error(`[Worker] PDF generation failed: ${err.message}`);
    throw err;
  }
}
