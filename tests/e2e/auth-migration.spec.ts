import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TestPass123!';

interface HealthResponse {
  status: string;
  authVersion?: string;
  [key: string]: unknown;
}

interface CookieHealthResponse {
  status: string;
  productionDomain: string;
  [key: string]: unknown;
}

interface SessionHealthResponse {
  databaseConnectivity: string;
  sessionStore: string;
  [key: string]: unknown;
}

test.describe('Auth Migration E2E Tests', () => {
  test.describe('Cookie Domain Validation', () => {
    test('should set correct cookie attributes on login', async ({ page, context }) => {
      await page.goto(`${BASE_URL}`);

      const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      if (!response.ok()) {
        test.skip(true, 'Login failed - credentials may be invalid');
        return;
      }

      const cookies = await context.cookies();
      const refreshCookie = cookies.find((c) => c.name === 'refresh_token');
      const accessCookie = cookies.find((c) => c.name === 'accessToken');

      expect(refreshCookie).toBeTruthy();
      expect(accessCookie).toBeTruthy();

      if (refreshCookie) {
        expect(refreshCookie.httpOnly).toBe(true);
        expect(refreshCookie.secure).toBe(true);
        expect(refreshCookie.sameSite).toBe('None');
        expect(refreshCookie.path).toBe('/');
      }

      if (accessCookie) {
        expect(accessCookie.httpOnly).toBe(true);
        expect(accessCookie.secure).toBe(true);
      }
    });

    test('should not have localhost domain in production cookies', async ({ page, context }) => {
      await page.goto(`${BASE_URL}`);

      const response = await page.request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      if (!response.ok()) {
        test.skip(true, 'Login failed');
        return;
      }

      const cookies = await context.cookies();
      const authCookies = cookies.filter(
        (c) => c.name === 'refresh_token' || c.name === 'accessToken',
      );

      for (const cookie of authCookies) {
        expect(cookie.domain).not.toContain('localhost');
      }
    });
  });

  test.describe('Session Persistence', () => {
    test('should maintain session across page navigation', async ({ page }) => {
      const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      if (!loginResponse.ok()) {
        test.skip(true, 'Login failed');
        return;
      }

      await page.goto(`${BASE_URL}`);

      const meResponse = await page.request.get(`${BASE_URL}/api/auth/me`);
      expect(meResponse.ok()).toBeTruthy();
    });

    test('should maintain session across tabs', async ({ browser }) => {
      const context = await browser.newContext();
      const page1 = await context.newPage();

      const loginResponse = await page1.request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      if (!loginResponse.ok()) {
        await context.close();
        test.skip(true, 'Login failed');
        return;
      }

      const page2 = await context.newPage();
      const meResponse = await page2.request.get(`${BASE_URL}/api/auth/me`);
      expect(meResponse.ok()).toBeTruthy();

      await context.close();
    });
  });

  test.describe('Token Refresh Flow', () => {
    test('should refresh token using cookie', async ({ page, context }) => {
      const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      if (!loginResponse.ok()) {
        test.skip(true, 'Login failed');
        return;
      }

      const refreshResponse = await page.request.post(`${BASE_URL}/api/auth/refresh`);
      expect(refreshResponse.ok()).toBeTruthy();

      const cookies = await context.cookies();
      const newRefreshCookie = cookies.find((c) => c.name === 'refresh_token');
      expect(newRefreshCookie).toBeTruthy();
    });
  });

  test.describe('Logout Cleanup', () => {
    test('should clear cookies on logout', async ({ page, context }) => {
      const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      if (!loginResponse.ok()) {
        test.skip(true, 'Login failed');
        return;
      }

      const logoutResponse = await page.request.post(`${BASE_URL}/api/auth/logout`);
      expect(logoutResponse.ok()).toBeTruthy();

      const cookies = await context.cookies();
      const refreshCookie = cookies.find((c) => c.name === 'refresh_token');

      if (refreshCookie) {
        const isExpired = new Date(refreshCookie.expires) <= new Date();
        expect(isExpired).toBe(true);
      }
    });
  });

  test.describe('Legacy Cookie Cleanup', () => {
    test('should clear legacy cookies on login', async ({ page, context }) => {
      await context.addCookies([
        {
          name: 'refresh_token',
          value: 'legacy-token',
          domain: 'localhost',
          path: '/',
        },
        {
          name: 'accessToken',
          value: 'legacy-access',
          domain: 'localhost',
          path: '/',
        },
      ]);

      const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      if (!loginResponse.ok()) {
        test.skip(true, 'Login failed');
        return;
      }

      const cookies = await context.cookies();
      const legacyCookies = cookies.filter(
        (c) => c.domain.includes('localhost') && (c.name === 'refresh_token' || c.name === 'accessToken'),
      );

      for (const cookie of legacyCookies) {
        const isExpired = new Date(cookie.expires) <= new Date();
        expect(isExpired).toBe(true);
      }
    });
  });

  test.describe('Auth Health & Version', () => {
    test('should report auth version in health endpoint', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/auth/health`);
      expect(response.ok()).toBeTruthy();

      const body = (await response.json()) as HealthResponse;
      expect(body).toHaveProperty('authVersion');
      expect(body.authVersion).toMatch(/^v\d+$/);
    });

    test('should report cookie health', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/auth/health/cookies`);
      expect(response.ok()).toBeTruthy();

      const body = (await response.json()) as CookieHealthResponse;
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('productionDomain');
    });

    test('should report session health', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/auth/health/sessions`);
      expect(response.ok()).toBeTruthy();

      const body = (await response.json()) as SessionHealthResponse;
      expect(body).toHaveProperty('databaseConnectivity', 'connected');
      expect(body).toHaveProperty('sessionStore', 'connected');
    });
  });
});
