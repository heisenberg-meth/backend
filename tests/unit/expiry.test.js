import { describe, it, expect } from '@jest/globals';
import {
  SQL_EXPIRED_CONDITION,
  EXPIRY_BUCKETS,
  getDaysToExpiry,
  getExpiryStatus,
  isExpired,
  getCalendarBoundaries,
} from '../../src/shared/utils/expiry.js';

describe('Shared Expiry Utility Unit Tests', () => {
  const baseDate = new Date('2026-09-08T12:00:00.000Z');

  describe('SQL_EXPIRED_CONDITION', () => {
    it('should match the authoritative SQL condition with <= CURRENT_DATE', () => {
      expect(SQL_EXPIRED_CONDITION).toBe('"expiryDate"::date <= CURRENT_DATE');
    });
  });

  describe('getDaysToExpiry', () => {
    it('returns negative days for past expiry date', () => {
      expect(getDaysToExpiry('2026-09-07', baseDate)).toBe(-1);
      expect(getDaysToExpiry('2026-08-08', baseDate)).toBe(-31);
    });

    it('returns 0 for today expiry date', () => {
      expect(getDaysToExpiry('2026-09-08', baseDate)).toBe(0);
      expect(getDaysToExpiry(new Date('2026-09-08T00:00:00.000Z'), baseDate)).toBe(0);
      expect(getDaysToExpiry(new Date('2026-09-08T23:59:59.999Z'), baseDate)).toBe(0);
    });

    it('returns positive days for future expiry date', () => {
      expect(getDaysToExpiry('2026-09-09', baseDate)).toBe(1);
      expect(getDaysToExpiry('2026-09-15', baseDate)).toBe(7);
      expect(getDaysToExpiry('2026-10-08', baseDate)).toBe(30);
    });

    it('handles null/undefined gracefully', () => {
      expect(getDaysToExpiry(null)).toBe(0);
      expect(getDaysToExpiry(undefined)).toBe(0);
    });
  });

  describe('isExpired', () => {
    it('evaluates yesterday as expired', () => {
      expect(isExpired('2026-09-07', baseDate)).toBe(true);
    });

    it('evaluates today as expired (primary business rule)', () => {
      expect(isExpired('2026-09-08', baseDate)).toBe(true);
      expect(isExpired(new Date('2026-09-08T00:00:00.000Z'), baseDate)).toBe(true);
    });

    it('evaluates tomorrow and future as not expired', () => {
      expect(isExpired('2026-09-09', baseDate)).toBe(false);
      expect(isExpired('2026-09-15', baseDate)).toBe(false);
      expect(isExpired('2027-01-01', baseDate)).toBe(false);
    });
  });

  describe('getExpiryStatus bucket boundaries', () => {
    it('returns EXPIRED for yesterday and earlier', () => {
      expect(getExpiryStatus('2026-09-07', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRED);
      expect(getExpiryStatus('2025-01-01', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRED);
    });

    it('returns EXPIRED for today (BD26032538 regression case)', () => {
      expect(getExpiryStatus('2026-09-08', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRED);
    });

    it('returns EXPIRING_7 for tomorrow through day 7', () => {
      expect(getExpiryStatus('2026-09-09', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRING_7); // day 1
      expect(getExpiryStatus('2026-09-15', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRING_7); // day 7
    });

    it('returns EXPIRING_30 for day 8 through day 30', () => {
      expect(getExpiryStatus('2026-09-16', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRING_30); // day 8
      expect(getExpiryStatus('2026-10-08', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRING_30); // day 30
    });

    it('returns EXPIRING_90 for day 31 through day 90', () => {
      expect(getExpiryStatus('2026-10-09', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRING_90); // day 31
      expect(getExpiryStatus('2026-12-07', baseDate)).toBe(EXPIRY_BUCKETS.EXPIRING_90); // day 90
    });

    it('returns SAFE for day 91 and beyond', () => {
      expect(getExpiryStatus('2026-12-08', baseDate)).toBe(EXPIRY_BUCKETS.SAFE); // day 91
      expect(getExpiryStatus('2027-09-08', baseDate)).toBe(EXPIRY_BUCKETS.SAFE);
    });
  });

  describe('getCalendarBoundaries', () => {
    it('creates correct end-of-day boundaries', () => {
      const { todayStart, todayEnd, plus7End, plus30End, plus90End } =
        getCalendarBoundaries(baseDate);

      expect(todayStart.getUTCHours()).toBe(0);
      expect(todayStart.getUTCMinutes()).toBe(0);
      expect(todayEnd.getUTCHours()).toBe(23);
      expect(todayEnd.getUTCMinutes()).toBe(59);
      expect(todayEnd.getUTCSeconds()).toBe(59);

      // Boundaries are chronologically ordered and mutually exclusive
      expect(todayStart.getTime()).toBeLessThan(todayEnd.getTime());
      expect(todayEnd.getTime()).toBeLessThan(plus7End.getTime());
      expect(plus7End.getTime()).toBeLessThan(plus30End.getTime());
      expect(plus30End.getTime()).toBeLessThan(plus90End.getTime());
    });
  });
});
