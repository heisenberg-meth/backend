import { test, expect } from '@playwright/test';
import logger from '../../src/shared/utils/logger.js';
const API_URL = process.env.API_URL || 'http://localhost:5000';

interface RegisterResponse {
  data: {
    message: string;
    userId: string;
  };
}

interface LoginResponse {
  data: {
    token: string;
    refreshToken: string;
    user: {
      email: string;
    };
  };
}

test.describe('Auth API (E2E)', () => {
  const testEmail = `testuser_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';

  test('should register a new user successfully', async ({ request }) => {
    const response = await request.post(`${API_URL}/api/auth/register`, {
      data: {
        email: testEmail,
        password: testPassword,
        confirmPassword: testPassword,
        fullName: 'E2E Test User',
        shopName: 'E2E Pharmacy',
        selectedPlanId: 'free-trial',
      },
    });

    if (response.status() === 409) {
      logger.info('User already exists, skipping');
      return;
    }

    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as RegisterResponse;
    expect(body.data).toHaveProperty('message', 'User registered successfully');
    expect(body.data).toHaveProperty('userId');
  });

  test('should login successfully with registered user', async ({ request }) => {
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));

    const response = await request.post(`${API_URL}/api/auth/login`, {
      data: {
        email: testEmail,
        password: testPassword,
      },
    });

    if (!response.ok()) {
      console.error('Login failed with response:', await response.text());
    }

    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as LoginResponse;
    expect(body.data).toHaveProperty('token');
    expect(body.data).toHaveProperty('refreshToken');
    expect(body.data.user).toHaveProperty('email', testEmail);
  });

  test('should block login with invalid password', async ({ request }) => {
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));

    const response = await request.post(`${API_URL}/api/auth/login`, {
      data: {
        email: testEmail,
        password: 'WrongPassword!',
      },
    });

    expect(response.status()).toBe(401);
  });
});
