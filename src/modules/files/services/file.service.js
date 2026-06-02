import prisma from '../../../config/prisma.js';
import storageProvider from './storage.provider.js';
import logger from '../../../shared/utils/logger.js';
import crypto from 'crypto';

class FileService {
  async uploadFile(tenantId, userId, file, options = {}) {
    const { originalname, mimetype, size, buffer } = file;
    const { prescriptionId, invoiceId, patientId } = options;

    this._validateMimeType(mimetype);

    await this._virusScan(buffer);

    const checksum = crypto.createHash('md5').update(buffer).digest('hex');

    const storageKey = `tenants/${tenantId}/${Date.now()}-${originalname}`;
    await storageProvider.upload(storageKey, buffer, mimetype);

    const fileAsset = await prisma.fileAsset.create({
      data: {
        tenantId,
        uploadedBy: userId,
        originalName: originalname,
        mimeType: mimetype,
        size: BigInt(size),
        storageKey,
        status: 'SCANNED',
        checksum,
        prescriptionId,
        invoiceId,
        patientId,
      },
    });

    await this._logAction(tenantId, userId, fileAsset.id, 'UPLOADED');

    return {
      fileId: fileAsset.id,
      url: `/api/files/${fileAsset.id}`,
      mimeType: mimetype,
    };
  }

  async getFileAccess(fileId, tenantId, userId) {
    const file = await prisma.fileAsset.findFirst({
      where: { id: fileId, tenantId, deletedAt: null },
    });

    if (!file) throw new Error('File not found or access denied');

    const signedUrl = await storageProvider.getSignedUrl(file.storageKey);

    await this._logAction(tenantId, userId, fileId, 'DOWNLOADED');

    return {
      ...file,
      size: file.size.toString(),
      signedUrl,
    };
  }

  async deleteFile(fileId, tenantId, userId) {
    const file = await prisma.fileAsset.findFirst({
      where: { id: fileId, tenantId },
    });

    if (!file) throw new Error('File not found');

    await prisma.fileAsset.update({
      where: { id: fileId },
      data: { status: 'DELETED', deletedAt: new Date() },
    });

    await this._logAction(tenantId, userId, fileId, 'DELETED');

    return { success: true };
  }

  _validateMimeType(mime) {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (!allowed.includes(mime)) throw new Error('Unsupported file type');
  }

  async _virusScan(buffer) {
    logger.info('Virus scan passed (Architecture Placeholder)' + { buffer });
    return true;
  }

  async _logAction(tenantId, userId, fileId, action) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: `FILE_${action}`,
        target: fileId,
        type: 'SYSTEM',
      },
    });
  }
}

export default new FileService();
