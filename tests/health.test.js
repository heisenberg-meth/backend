import request from 'supertest';
import app from '../src/app.js';
import { describe, it, expect } from '@jest/globals';

describe('API Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 and online status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('online');
    });
  });
});
