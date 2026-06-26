import jwt from 'jsonwebtoken';
import secretManager from '../../config/secrets.js';

/**
 * Sign a new JWT access token.
 * @param {Object} payload - The payload to encode (e.g., { id, email, role })
 * @param {Object} options - Optional overrides (expiresIn, secret)
 * @returns {string} Signed JWT token
 */
export function signAccessToken(payload, options = {}) {
  const { expiresIn = '15m', secret = secretManager.getPrimarySecret() } = options;
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Sign a refresh token with longer expiry.
 * @param {Object} payload
 * @param {Object} options
 * @returns {string}
 */
export function signRefreshToken(payload, options = {}) {
  const { expiresIn = '7d', secret = secretManager.getPrimarySecret() } = options;
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verify a JWT token and return the decoded payload.
 * @param {string} token
 * @param {string} [secret] - Optional secret override
 * @returns {Object} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyToken(token, secret = secretManager.getPrimarySecret()) {
  return jwt.verify(token, secret);
}

/**
 * Decode a JWT token without verification (for inspecting payload).
 * @param {string} token
 * @returns {Object|null} Decoded payload or null
 */
export function decodeToken(token) {
  try {
    return jwt.decode(token);
  } catch {
    return null;
  }
}

/**
 * Check if a token is expired without throwing.
 * @param {string} token
 * @returns {boolean}
 */
export function isTokenExpired(token) {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) return true;
  return Date.now() >= decoded.exp * 1000;
}

/**
 * Generate token payload from a user object.
 * @param {Object} user - User object from Prisma
 * @returns {Object}
 */
export function generateTokenPayload(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role || 'user',
  };
}
