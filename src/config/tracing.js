import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import logger from '../shared/utils/logger.js';

const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

const sdk = otelEndpoint
  ? new NodeSDK({
      resource: resourceFromAttributes({
        [SemanticResourceAttributes.SERVICE_NAME]: 'viyan-backend',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
      }),
      traceExporter: new OTLPTraceExporter({ url: otelEndpoint }),
      instrumentations: [getNodeAutoInstrumentations()],
    })
  : null;

if (sdk) {
  sdk.start();

  process.on('SIGTERM', async () => {
    try {
      await sdk.shutdown();
    } catch (error) {
      logger.error('Error terminating tracing', error);
    } finally {
      process.exit(0);
    }
  });
}

export default sdk;
