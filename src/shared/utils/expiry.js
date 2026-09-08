/**
 * Shared Expiry Utility - Authoritative Source of Truth
 *
 * Expiry Rule:
 *  - expiryDate <= TODAY -> EXPIRED (daysRemaining <= 0)
 *  - expiryDate > TODAY  -> NOT EXPIRED (daysRemaining > 0)
 *
 * Mutually Exclusive Buckets:
 *  - EXPIRED:     expiryDate <= TODAY
 *  - EXPIRING_7:  TODAY < expiryDate <= TODAY + 7 days
 *  - EXPIRING_30: TODAY + 7 days < expiryDate <= TODAY + 30 days
 *  - EXPIRING_90: TODAY + 30 days < expiryDate <= TODAY + 90 days
 *  - SAFE:        expiryDate > TODAY + 90 days
 */

export const SQL_EXPIRED_CONDITION = '"expiryDate"::date <= CURRENT_DATE';

export const EXPIRY_BUCKETS = Object.freeze({
  EXPIRED: 'EXPIRED',
  EXPIRING_7: 'EXPIRING_7',
  EXPIRING_30: 'EXPIRING_30',
  EXPIRING_90: 'EXPIRING_90',
  SAFE: 'SAFE',
});

function parseDateParts(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.substring(0, 10).split('-').map(Number);
    return { year: y, month: m - 1, date: day };
  }
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  try {
    const iso = dt.toISOString();
    const [y, m, day] = iso.substring(0, 10).split('-').map(Number);
    return { year: y, month: m - 1, date: day };
  } catch {
    return {
      year: dt.getUTCFullYear(),
      month: dt.getUTCMonth(),
      date: dt.getUTCDate(),
    };
  }
}

/**
 * Calculates calendar-day difference between expiryDate and baseDate.
 *  - <= 0 means expired (0 = expires today, < 0 = already expired)
 *  - > 0 means not expired yet (e.g. 1 = expires tomorrow)
 *
 * @param {Date|string|number} expiryDate
 * @param {Date|string|number} [baseDate=new Date()]
 * @returns {number}
 */
export function getDaysToExpiry(expiryDate, baseDate = new Date()) {
  if (!expiryDate) return 0;

  const expParts = parseDateParts(expiryDate);
  if (!expParts) return 0;

  const baseParts = parseDateParts(baseDate);
  if (!baseParts) return 0;

  const diffMs =
    Date.UTC(expParts.year, expParts.month, expParts.date) -
    Date.UTC(baseParts.year, baseParts.month, baseParts.date);

  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Returns the authoritative expiry classification based on calendar dates.
 *
 * @param {Date|string|number} expiryDate
 * @param {Date|string|number} [baseDate=new Date()]
 * @returns {'EXPIRED'|'EXPIRING_7'|'EXPIRING_30'|'EXPIRING_90'|'SAFE'}
 */
export function getExpiryStatus(expiryDate, baseDate = new Date()) {
  const days = getDaysToExpiry(expiryDate, baseDate);

  if (days <= 0) return EXPIRY_BUCKETS.EXPIRED;
  if (days <= 7) return EXPIRY_BUCKETS.EXPIRING_7;
  if (days <= 30) return EXPIRY_BUCKETS.EXPIRING_30;
  if (days <= 90) return EXPIRY_BUCKETS.EXPIRING_90;
  return EXPIRY_BUCKETS.SAFE;
}

/**
 * Checks whether an item is expired according to the business rule (expiryDate <= TODAY).
 *
 * @param {Date|string|number} expiryDate
 * @param {Date|string|number} [baseDate=new Date()]
 * @returns {boolean}
 */
export function isExpired(expiryDate, baseDate = new Date()) {
  return getDaysToExpiry(expiryDate, baseDate) <= 0;
}

/**
 * Generates calendar date boundaries for Prisma/SQL queries.
 * End-of-day boundaries (23:59:59.999) ensure batches expiring on the target date
 * are fully matched without timezone mismatch.
 *
 * @param {Date} [baseDate=new Date()]
 * @returns {{ todayStart: Date, todayEnd: Date, plus7End: Date, plus30End: Date, plus90End: Date }}
 */
export function getCalendarBoundaries(baseDate = new Date()) {
  const parts = parseDateParts(baseDate) || {
    year: new Date().getUTCFullYear(),
    month: new Date().getUTCMonth(),
    date: new Date().getUTCDate(),
  };

  const todayStart = new Date(Date.UTC(parts.year, parts.month, parts.date, 0, 0, 0, 0));
  const todayEnd = new Date(Date.UTC(parts.year, parts.month, parts.date, 23, 59, 59, 999));

  const plus7End = new Date(todayEnd);
  plus7End.setUTCDate(plus7End.getUTCDate() + 7);

  const plus30End = new Date(todayEnd);
  plus30End.setUTCDate(plus30End.getUTCDate() + 30);

  const plus90End = new Date(todayEnd);
  plus90End.setUTCDate(plus90End.getUTCDate() + 90);

  return { todayStart, todayEnd, plus7End, plus30End, plus90End };
}

export default {
  SQL_EXPIRED_CONDITION,
  EXPIRY_BUCKETS,
  getDaysToExpiry,
  getExpiryStatus,
  isExpired,
  getCalendarBoundaries,
};
