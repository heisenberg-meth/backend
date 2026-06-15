import crypto from 'crypto';

/**
 * Convert base32 string to hex string
 */
function base32tohex(base32) {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';

  for (let i = 0; i < base32.length; i++) {
    const val = base32chars.indexOf(base32.charAt(i).toUpperCase());
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  for (let i = 0; i + 4 <= bits.length; i += 4) {
    const chunk = bits.substr(i, 4);
    hex = hex + parseInt(chunk, 2).toString(16);
  }
  return hex;
}

/**
 * Generate a random base32 secret
 */
export function generateSecret(length = 20) {
  const randomBuffer = crypto.randomBytes(length);
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < randomBuffer.length; i++) {
    secret += base32chars[randomBuffer[i] % 32];
  }
  return secret;
}

/**
 * Generate a TOTP token for a given secret
 */
export function generateTOTP(secret, window = 0) {
  const hex = base32tohex(secret);
  const key = Buffer.from(hex, 'hex');

  const epoch = Math.round(Date.now() / 1000.0);
  const time = Buffer.alloc(8);

  let timeValue = Math.floor(epoch / 30) + window;
  for (let i = 7; i >= 0; i--) {
    time[i] = timeValue & 0xff;
    timeValue = Math.floor(timeValue / 256);
  }

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(time);
  const result = hmac.digest();

  const offset = result[result.length - 1] & 0xf;
  const otp =
    (((result[offset] & 0x7f) << 24) |
      ((result[offset + 1] & 0xff) << 16) |
      ((result[offset + 2] & 0xff) << 8) |
      (result[offset + 3] & 0xff)) %
    1000000;

  return otp.toString().padStart(6, '0');
}

/**
 * Verify a TOTP token against a secret
 */
export function verifyTOTP(token, secret, window = 1) {
  if (!token || !secret) return false;
  // Check current window and surrounding windows for drift
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    if (generateTOTP(secret, errorWindow) === token) {
      return true;
    }
  }
  return false;
}
