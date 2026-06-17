// k6 Load Test: Inventory Operations
// Run: k6 run tests/load/inventory-load.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const searchSuccessRate = new Rate('search_success');
const searchDuration = new Trend('search_duration');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    http_req_failed: ['rate<0.05'],
    search_success: ['rate>0.98'],
  },
};

function getAuthHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
    },
  };
}

export default function () {
  group('Search medicines', () => {
    const queries = ['paracetamol', 'amoxicillin', 'ibuprofen', 'cetirizine', 'metformin'];
    const query = queries[Math.floor(Math.random() * queries.length)];

    const res = http.get(
      `${BASE_URL}/api/inventory/medicines?search=${query}&page=1&limit=20`,
      getAuthHeaders()
    );

    check(res, {
      'search status is 200': (r) => r.status === 200,
      'search returns results': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data !== undefined;
        } catch {
          return false;
        }
      },
    });

    searchSuccessRate.add(res.status === 200);
    searchDuration.add(res.timings.duration);
  });

  sleep(0.5);

  group('Get inventory summary', () => {
    const res = http.get(`${BASE_URL}/api/inventory/summary`, getAuthHeaders());

    check(res, {
      'summary status is 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);

  group('Get low stock alerts', () => {
    const res = http.get(`${BASE_URL}/api/inventory/alerts/low-stock`, getAuthHeaders());

    check(res, {
      'low stock status is 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);

  group('Get near expiry batches', () => {
    const res = http.get(`${BASE_URL}/api/inventory/expiry/near`, getAuthHeaders());

    check(res, {
      'expiry status is 200': (r) => r.status === 200,
    });
  });

  sleep(1);
}
