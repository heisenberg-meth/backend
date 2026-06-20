// Ensure required environment variables for test execution are loaded
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
process.env.JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET || 'supersecretcookiekey';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
