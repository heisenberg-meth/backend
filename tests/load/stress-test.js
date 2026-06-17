// k6 Stress Test: Full System
// Run: k6 run tests/load/stress-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import ENV from 'k6/x/env';

const BASE_URL = ENV.BASE_URL || 'http://localhost:8080';
const AUTH_TOKEN = ENV.AUTH_TOKEN || '';

const overallSuccessRate = new Rate('overall_success');
const responseTime = new Trend('response_time');
const requestCount = new Counter('total_requests');

export const options = {
  stages: [
    { duration: '1m', target: 50 }, // Normal load
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 }, // Peak load
    { duration: '2m', target: 100 },
    { duration: '1m', target: 200 }, // Stress test
    { duration: '2m', target: 200 },
    { duration: '1m', target: 300 }, // Breaking point
    { duration: '2m', target: 300 },
    { duration: '1m', target: 0 }, // Recovery
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.15'],
    overall_success: ['rate>0.85'],
  },
};

function getAuthHeaders() {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
    },
  };
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const endpoints = [
    { method: 'GET', path: '/api/billing/invoices?page=1&limit=20' },
    { method: 'GET', path: '/api/inventory/medicines?page=1&limit=50' },
    { method: 'GET', path: '/api/inventory/summary' },
    { method: 'GET', path: '/api/inventory/alerts/low-stock' },
    { method: 'GET', path: '/api/inventory/expiry/near' },
    { method: 'GET', path: '/api/dashboard' },
    { method: 'GET', path: '/api/patients?page=1&limit=20' },
    { method: 'GET', path: '/api/sales?page=1&limit=20' },
  ];

  const endpoint = randomChoice(endpoints);
  const url = `${BASE_URL}${endpoint.path}`;

  let res;
  if (endpoint.method === 'GET') {
    res = http.get(url, getAuthHeaders());
  } else {
    res = http.post(url, null, getAuthHeaders());
  }

  check(res, {
    [`${endpoint.path} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });

  overallSuccessRate.add(res.status >= 200 && res.status < 300);
  responseTime.add(res.timings.duration);
  requestCount.add(1);

  sleep(Math.random() * 2 + 0.5);
}
