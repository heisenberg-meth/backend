import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../../config/jwt.config.js';
import { CURRENT_AUTH_VERSION } from '../auth.constants.js';
import env from '../../../config/env.js';
import secretManager from '../../../config/secrets.js';

class TokenService {
  signAccessToken(user, sessionId) {
    return jwt.sign(
      {
        id: user.id,
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        branchId: user.branchId,
        sessionId,
        authVersion: CURRENT_AUTH_VERSION,
      },
      JWT_CONFIG.secret,
      { expiresIn: JWT_CONFIG.accessToken.expiresIn, algorithm: JWT_CONFIG.accessToken.algorithm },
    );
  }

  signRefreshToken(sessionId, jti) {
    return jwt.sign(
      { sessionId, jti, authVersion: CURRENT_AUTH_VERSION },
      JWT_CONFIG.refreshSecret,
      {
        expiresIn: JWT_CONFIG.refreshToken.expiresIn,
        algorithm: JWT_CONFIG.refreshToken.algorithm,
      },
    );
  }

  verifyRefreshToken(token) {
    return jwt.verify(token, JWT_CONFIG.refreshSecret);
  }

  verifyAccessToken(token) {
    return jwt.verify(token, JWT_CONFIG.secret);
  }

  decodeToken(token) {
    return jwt.decode(token);
  }

  // --- Admin Tokens ---
  signAdminAccessToken(adminId, role) {
    return jwt.sign({ adminId, role }, env.jwtSecrets[0], { expiresIn: '15m', algorithm: 'HS256' });
  }

  signAdminRefreshToken(adminId) {
    return jwt.sign({ adminId, type: 'refresh' }, env.jwtSecrets[0], {
      expiresIn: '30d',
      algorithm: 'HS256',
    });
  }

  verifyAdminRefreshToken(token) {
    return jwt.verify(token, env.jwtSecrets[0]);
  }

  // --- Password Reset Tokens ---
  signPasswordResetToken(userId) {
    return jwt.sign({ type: 'password-reset', userId }, secretManager.getPrimarySecret(), {
      expiresIn: '5m',
      algorithm: 'HS256',
    });
  }

  verifyPasswordResetToken(token) {
    return jwt.verify(token, secretManager.getPrimarySecret());
  }
}

export default new TokenService();
