import env from './env.js';

class SecretManager {
  constructor() {
    this.jwtSecrets = env.jwtSecrets;
    this.primarySecret = this.jwtSecrets[0];
  }

  /**
   * Get primary secret for signing new tokens
   */
  getPrimarySecret() {
    return this.primarySecret;
  }

  /**
   * Get all valid secrets for verification (supports rotation)
   */
  getAllSecrets() {
    return this.jwtSecrets;
  }

  /**
   * Logic to rotate secrets (e.g. from HashiCorp Vault)
   * This is a placeholder for actual integration
   */
  async refreshSecrets() {
    // In production, you would fetch from Vault/Doppler here
    console.log('[SECURITY] Refreshing system secrets...');
  }
}

export default new SecretManager();
