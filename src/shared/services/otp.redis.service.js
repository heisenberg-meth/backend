import { initRedis } from '../../config/redis.js';

const redisClient = initRedis();

class OtpRedisService {
  /**
   * Store OTP in Redis with TTL
   * @param {string} email 
   * @param {string} otp 
   * @param {number} ttlSeconds Default 600 (10 minutes)
   */
  async storeOtp(email, otp, ttlSeconds = 600) {
    const key = `otp:${email}`;
    await redisClient.set(key, otp, 'EX', ttlSeconds);
  }

  /**
   * Verify OTP from Redis
   * @param {string} email 
   * @param {string} otp 
   * @returns {boolean}
   */
  async verifyOtp(email, otp) {
    const key = `otp:${email}`;
    const storedOtp = await redisClient.get(key);
    
    if (storedOtp === otp) {
      await redisClient.del(key); // Use once
      return true;
    }
    return false;
  }
}

export default new OtpRedisService();
