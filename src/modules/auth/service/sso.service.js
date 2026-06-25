import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import authRepository from '../repository/auth.prisma.repository.js';
import tokenService from './token.service.js';
import sessionService from './session.service.js';
import loginHistoryService from './login-history.service.js';
import adminGovernanceService from './admin-governance.service.js';
import AUTH_ERRORS from '../../../config/auth.errors.js';
import eventBus from '../../../shared/services/eventbus.service.js';
import logger from '../../../shared/utils/logger.js';

class SsoService {
  /**
   * Generates federation authorization URL for OAuth 2.0 / OIDC IdPs.
   */
  getAuthorizationUrl({ provider, tenantId, redirectUri }) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(JSON.stringify({ tenantId, nonce, provider })).toString('base64');

    if (provider.toLowerCase() === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID || 'mock_google_client_id';
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&response_type=code&scope=openid%20email%20profile&state=${encodeURIComponent(state)}`;
    }

    if (provider.toLowerCase() === 'microsoft') {
      const clientId = process.env.MICROSOFT_CLIENT_ID || 'mock_microsoft_client_id';
      return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&response_type=code&scope=openid%20email%20profile&state=${encodeURIComponent(state)}`;
    }

    throw new Error(`Unsupported SSO federation provider: ${provider}`);
  }

  /**
   * Processes IdP callback, provisions JIT enterprise users, and establishes session.
   */
  async handleCallback({ provider, code, statePayload, ipAddress, userAgent }) {
    if (!code || !statePayload) throw new Error('Invalid federation callback payload');

    let decodedState;
    try {
      decodedState = JSON.parse(Buffer.from(statePayload, 'base64').toString('utf8'));
    } catch (e) {
      throw new Error('Corrupted SSO callback state', e);
    }

    const { tenantId } = decodedState;

    // Simulate IdP token exchange and profile retrieval
    const ssoProfile = await this._exchangeCodeForProfile(provider, code);
    const normalizedEmail = ssoProfile.email.toLowerCase().trim();

    let user = await authRepository.findUserByEmail(normalizedEmail);

    if (!user) {
      // Check tenant JIT provisioning governance policy
      const policy = await adminGovernanceService.getTenantAuthPolicy(tenantId);
      if (!policy.jitProvisioningEnabled) {
        logger.warn(
          { email: normalizedEmail, tenantId },
          'SSO login rejected: JIT provisioning disabled',
        );
        const err = new Error(
          'User account not found. Just-in-time provisioning is disabled for this organization.',
        );
        err.code = AUTH_ERRORS.AUTH_UNAUTHORIZED;
        throw err;
      }

      // Provision JIT user
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: ssoProfile.name || 'Enterprise User',
          tenantId: tenantId || 'default_tenant',
          role: 'STAFF',
          status: 'ACTIVE',
          emailVerified: true, // IdP verified
        },
      });

      logger.info({ userId: user.id, tenantId }, 'SAML/OAuth JIT enterprise user provisioned');
      eventBus.publish('EnterpriseUserProvisioned', {
        userId: user.id,
        email: normalizedEmail,
        provider,
      });
    }

    // Check account status
    if (user.status === 'BLOCKED') {
      throw new Error('Your account has been blocked. Contact administrator.');
    }

    // Establish enterprise session
    const session = await sessionService.createSession({
      userId: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      role: user.role,
      userAgent,
      ipAddress,
      deviceToken: 'sso_federated_device',
    });

    const jti = tokenService.generateJti();
    const token = tokenService.signAccessToken(user, session.id);
    const refreshToken = tokenService.signRefreshToken(session.id, jti);

    await loginHistoryService.recordLoginEvent({
      userId: user.id,
      email: normalizedEmail,
      ipAddress,
      userAgent,
      status: 'SUCCESS',
    });

    eventBus.publish('UserLoggedIn', {
      userId: user.id,
      tenantId: user.tenantId,
      sessionId: session.id,
      authMethod: `SSO_${provider?.toUpperCase()}`,
      timestamp: new Date().toISOString(),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      },
      token,
      refreshToken,
      sessionId: session.id,
    };
  }

  async _exchangeCodeForProfile(provider, code) {
    // In production, HTTP POST to IdP token endpoint
    return {
      email: `user.${code.substring(0, 6)}@viyaninfo.com`,
      name: `Federated User (${provider})`,
      sub: `idp_${code}`,
    };
  }
}

export default new SsoService();
