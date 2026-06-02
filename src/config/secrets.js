import env from './env.js';

class SecretManager {
  constructor() {
    this.jwtSecrets = env.jwtSecrets;
    this.primarySecret = this.jwtSecrets[0];
  }

  getPrimarySecret() {
    return this.primarySecret;
  }

  getAllSecrets() {
    return this.jwtSecrets;
  }

  async refreshSecrets() {
    console.log('[SECURITY] Refreshing system secrets...');
  }
}

export default new SecretManager();
