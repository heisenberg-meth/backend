// k6 Load Test: Billing & Invoices
// Run: k6 run tests/load/billing-load.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const invoiceSuccessRate = new Rate('invoice_success');
const invoiceDuration = new Trend('invoice_duration');
const invoiceCount = new Counter('invoices_created');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '2m', target: 25 },
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.1'],
    invoice_success: ['rate>0.95'],
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
  group('GET /api/billing/invoices', () => {
    const res = http.get(`${BASE_URL}/api/billing/invoices?page=1&limit=20`, getAuthHeaders());

    check(res, {
      'list invoices status is 200': (r) => r.status === 200,
      'list invoices has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.success === true;
        } catch {
          return false;
        }
      },
    });

    invoiceSuccessRate.add(res.status === 200);
    invoiceDuration.add(res.timings.duration);
  });

  sleep(1);

  group('GET /api/inventory/medicines', () => {
    const res = http.get(`${BASE_URL}/api/inventory/medicines?page=1&limit=50`, getAuthHeaders());

    check(res, {
      'list medicines status is 200': (r) => r.status === 200,
    });
  });

  sleep(1);

  group('GET /api/dashboard', () => {
    const res = http.get(`${BASE_URL}/api/dashboard`, getAuthHeaders());

    check(res, {
      'dashboard status is 200': (r) => r.status === 200,
    });
  });

  sleep(1);
}
