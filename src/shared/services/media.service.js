import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import env from '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, '../../../uploads');

const PLACEHOLDER_URL = '/assets/no-image.png';

const PRIVATE_IP_PATTERNS = [
  /^http:\/\/localhost/i,
  /^http:\/\/127\.0\.0\.1/i,
  /^http:\/\/192\.168\./i,
  /^http:\/\/10\./i,
  /^http:\/\/172\.(1[6-9]|2\d|3[01])\./i,
];

function isPrivateUrl(url) {
  if (!url || typeof url !== 'string') return true;
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(url));
}

function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return null;

  let cleaned = url.trim();

  if (isPrivateUrl(cleaned)) {
    const relativePath = cleaned.replace(/^https?:\/\/[^/]+/, '');
    if (relativePath && !relativePath.startsWith('http')) {
      cleaned = relativePath;
    } else {
      return null;
    }
  }

  if (cleaned.startsWith('http://')) {
    cleaned = 'https://' + cleaned.slice(7);
  }

  return cleaned;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

class MediaService {
  static getMediaBaseUrl() {
    return env.mediaBaseUrl || 'https://medassist-backend-hryu.onrender.com';
  }

  static generatePublicUrl(relativePath) {
    if (!relativePath || typeof relativePath !== 'string') return null;

    const sanitized = sanitizeUrl(relativePath);
    if (sanitized && sanitized.startsWith('http')) {
      return sanitized;
    }

    let cleanPath = relativePath.replace(/^https?:\/\/[^/]+/, '');

    if (!cleanPath.startsWith('/')) {
      cleanPath = '/' + cleanPath;
    }

    const fullUrl = `${this.getMediaBaseUrl()}${cleanPath}`;
    return fullUrl;
  }

  static validateAndGenerateUrl(relativePath) {
    if (!relativePath || typeof relativePath !== 'string') {
      return { url: null, exists: false };
    }

    const localPath = path.join(UPLOADS_DIR, relativePath.replace(/^\/uploads\//, ''));
    const exists = fileExists(localPath);

    if (!exists) {
      return { url: this.generatePublicUrl(relativePath), exists: false };
    }

    return { url: this.generatePublicUrl(relativePath), exists: true };
  }

  static processImageField(imagePath) {
    if (!imagePath) return { url: null, exists: false };

    return this.validateAndGenerateUrl(imagePath);
  }

  static processMediaResponse(data, imageFields = ['image', 'logo', 'photo', 'avatar', 'logoUrl', 'imageUrl']) {
    if (!data || typeof data !== 'object') return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.processMediaResponse(item, imageFields));
    }

    const processed = { ...data };

    for (const field of imageFields) {
      if (processed[field] && typeof processed[field] === 'string') {
        const result = this.processImageField(processed[field]);
        processed[field] = result.url;
        processed[`${field}Exists`] = result.exists;
      }
    }

    return processed;
  }

  static getPlaceholderUrl() {
    return `${this.getMediaBaseUrl()}${PLACEHOLDER_URL}`;
  }

  static isHttpsUrl(url) {
    return url && typeof url === 'string' && url.startsWith('https://');
  }

  static enforceHttps(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('http://')) {
      return 'https://' + url.slice(7);
    }
    return url;
  }
}

export default MediaService;
