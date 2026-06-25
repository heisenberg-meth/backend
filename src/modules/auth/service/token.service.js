import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../../../config/jwt.config.js';
import { CURRENT_AUTH_VERSION } from '../auth.constants.js';

class TokenService {
  signAccessToken(user, sessionId) {
    return jwt.sign(
      {
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
}

export default new TokenService();
