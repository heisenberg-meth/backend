import http from 'k6/http';
import { check, sleep } from 'k6';

// Run with: k6 run tests/load/k6-load.js

export const options = {
  stages: [
    { duration: '30s', target: 500 }, // Ramp-up to 500 VUs
    { duration: '1m', target: 1000 }, // Spike to 10k VUs (simulated, keeping it at 1k locally to avoid crashing laptop)
    { duration: '30s', target: 0 }, // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.01'], // Error rate should be less than 1%
  },
};

const BASE_URL = process.env.API_URL || 'http://localhost/api';

export default function () {
  // Scenario 1: Health check (Testing Redis + DB bottlenecks)
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health check status is 200': (r) => r.status === 200,
  });

  // Scenario 2: Try to login to test DB auth lookups & rate limits
  const loginPayload = JSON.stringify({
    email: 'nonexistent_load_test@example.com',
    password: 'password123',
  });

  const headers = { 'Content-Type': 'application/json' };

  const loginRes = http.post(`${BASE_URL}/auth/login`, loginPayload, { headers });

  // We expect 401 or 429 depending on rate limits
  check(loginRes, {
    'auth returned 401 or 429': (r) => r.status === 401 || r.status === 429,
  });

  sleep(1);
}
