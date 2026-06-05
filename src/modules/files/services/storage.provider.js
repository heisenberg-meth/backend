import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import env from '../../../config/env.js';

class S3StorageProvider {
  constructor() {
    this.client = new S3Client({
      region: env.s3.region,
      credentials: {
        accessKeyId: env.s3.accessKey,
        secretAccessKey: env.s3.secretKey,
      },
    });
    this.bucket = env.s3.bucketName;
  }

  async upload(key, body, mimeType) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
    });
    await this.client.send(command);
    return key;
  }

  async getSignedUrl(key, expiresId = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await getSignedUrl(this.client, command, { expiresIn: expiresId });
  }

  async delete(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return await this.client.send(command);
  }
}

export default new S3StorageProvider();
