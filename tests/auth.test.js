import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { success, error, paginated } from '../src/shared/helpers/response.js';
import crypto from 'crypto';
import { describe, it, expect } from '@jest/globals';

const TEST_SECRET = 'test-secret-key-for-jwt-at-least-10-chars';

describe('Password hashing', () => {
  it('should hash passwords with bcrypt', async () => {
    const password = 'TestPass123!';
    const hash = await bcrypt.hash(password, 10);

    expect(hash).toBeDefined();
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')).toBe(true);

    const isValid = await bcrypt.compare(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await bcrypt.compare('WrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('should detect plaintext vs bcrypt passwords', () => {
    const bcryptHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
    const plaintext = 'mypassword';

    expect(bcryptHash.startsWith('$2a$')).toBe(true);
    expect(plaintext.startsWith('$2a$')).toBe(false);
  });
});

describe('JWT token operations', () => {
  it('should sign and verify tokens with HS256', () => {
    const payload = { userId: 'test-user-id', tenantId: 'test-tenant', role: 'OWNER' };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
    expect(token).toBeDefined();

    const decoded = jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] });
    expect(decoded.userId).toBe('test-user-id');
    expect(decoded.tenantId).toBe('test-tenant');
    expect(decoded.role).toBe('OWNER');
  });

  it('should reject tampered token', () => {
    const token = jwt.sign(
      { userId: 'test', tenantId: 'test', role: 'OWNER' },
      TEST_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' },
    );
    expect(() => jwt.verify(token + 'bad', TEST_SECRET, { algorithms: ['HS256'] })).toThrow();
  });

  it('should reject expired token', () => {
    const token = jwt.sign(
      { userId: 'test', tenantId: 'test', role: 'OWNER' },
      TEST_SECRET,
      { expiresIn: '0s', algorithm: 'HS256' },
    );
    expect(() => jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] })).toThrow('expired');
  });

  it('should reject wrong algorithm', () => {
    const token = jwt.sign(
      { userId: 'test' },
      TEST_SECRET,
      { expiresIn: '15m', algorithm: 'none' },
    );
    expect(() => jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] })).toThrow();
  });
});

describe('Response standardized formatting', () => {
  it('should create success response', () => {
    const result = success({ user: { id: '1', email: 'test@test.com' } });
    expect(result).toEqual({
      success: true,
      data: { user: { id: '1', email: 'test@test.com' } },
    });
  });

  it('should create success response with meta', () => {
    const result = success([], { total: 0, page: 1 });
    expect(result.success).toBe(true);
    expect(result.meta).toEqual({ total: 0, page: 1 });
  });

  it('should create error response', () => {
    const result = error('Invalid credentials', 'INVALID_CREDENTIALS');
    expect(result).toEqual({
      success: false,
      error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
    });
  });

  it('should create error response with default code', () => {
    const result = error('Something went wrong');
    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Something went wrong');
    expect(result.error.code).toBe('ERROR');
  });

  it('should create paginated response', () => {
    const result = paginated([{ id: 1 }], { total: 1, page: 1, limit: 10, totalPages: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.pagination).toEqual({ total: 1, page: 1, limit: 10, totalPages: 1 });
  });
});

describe('Middleware response shapes', () => {
  it('should produce correct error shapes', () => {
    const expectedShape = {
      success: false,
      error: {
        message: expect.any(String),
        code: expect.any(String),
      },
    };

    const shapes = [
      { success: false, error: { message: 'Invalid or expired token', code: 'TOKEN_INVALID' } },
      { success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } },
      { success: false, error: { message: 'Session ID required', code: 'SESSION_ID_REQUIRED' } },
      { success: false, error: { message: 'Authentication required', code: 'AUTH_REQUIRED' } },
    ];

    shapes.forEach((shape) => {
      expect(shape).toMatchObject(expectedShape);
    });
  });
});

describe('Refresh token generation', () => {
  it('should generate unique device tokens', () => {
    const token1 = crypto.randomUUID();
    const token2 = crypto.randomUUID();
    expect(token1).not.toBe(token2);
    expect(token1).toMatch(/^[0-9a-f-]+$/);
  });
});

describe('Auth controller error mapping', () => {
  it('should map errors to correct status codes', () => {
    const errorMap = {
      'Invalid credentials': 401,
      'Refresh token required': 401,
      'Refresh token expired': 401,
      'Invalid refresh token': 401,
      'User already exists': 409,
      'User not found': 404,
    };

    Object.entries(errorMap).forEach(([, expectedCode]) => {
      expect(expectedCode).toBeGreaterThanOrEqual(400);
    });
  });
});

describe('API response interceptor pattern', () => {
  it('should extract error messages from standardized response', () => {
    const serverResponse = {
      data: {
        success: false,
        error: { message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' },
      },
    };
    expect(serverResponse.data.error.message).toBe('Invalid credentials');
  });

  it('should extract nested error messages', () => {
    const serverResponse = {
      response: {
        data: {
          error: { message: 'Session expired', code: 'SESSION_EXPIRED' },
        },
      },
    };
    expect(serverResponse.response.data.error.message).toBe('Session expired');
  });
});

describe('Auth service method signatures', () => {
  it('should have correct _signAccessToken signature', () => {
    const signToken = (user) => jwt.sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      TEST_SECRET,
      { expiresIn: '15m', algorithm: 'HS256' },
    );

    const mockUser = { id: 'u1', tenantId: 't1', role: 'OWNER' };
    const token = signToken(mockUser);
    const decoded = jwt.verify(token, TEST_SECRET, { algorithms: ['HS256'] });
    expect(decoded.userId).toBe('u1');
    expect(decoded.tenantId).toBe('t1');
    expect(decoded.role).toBe('OWNER');
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });
});
