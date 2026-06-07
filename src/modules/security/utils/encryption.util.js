import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

if (!process.env.ENCRYPTION_KEY) {
  throw new Error(
    'FATAL: ENCRYPTION_KEY environment variable is required. ' +
      'Set a cryptographically random 32-byte key before starting the application.',
  );
}

const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'utf8');

export const encrypt = (text) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
};

export const decrypt = (text) => {
  const [ivHex, tagHex, encrypted] = text.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
