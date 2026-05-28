import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import env from '../../../config/env.js';
import logger from '../../../shared/utils/logger.js';

class S3StorageService {
  constructor() {
    this.client = new S3Client({
      region: env.s3.region,
      credentials:
        env.s3.accessKey && env.s3.secretKey
          ? {
              accessKeyId: env.s3.accessKey,
              secretAccessKey: env.s3.secretKey,
            }
          : undefined,
    });
    this.bucket = env.s3.bucketName;
  }

  async uploadPDF(buffer, key, contentType = 'application/pdf') {
    if (!this.bucket) {
      logger.warn('[S3] No bucket configured, returning buffer directly');
      return { url: null, buffer };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'no-store',
    });

    await this.client.send(command);
    logger.info(`[S3] Uploaded PDF: ${key}`);

    return { url: `s3://${this.bucket}/${key}`, key };
  }

  async getSignedUrl(key, expiresIn = 3600) {
    if (!this.bucket) {
      return null;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseCacheControl: 'no-store',
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    return url;
  }

  generatePDFKey(tenantId, invoiceId, watermark = null) {
    const timestamp = Date.now();
    const prefix = watermark ? `invoices/${tenantId}/watermarked` : `invoices/${tenantId}/original`;
    return `${prefix}/${invoiceId}-${timestamp}.pdf`;
  }
}

export default new S3StorageService();
