/**
 * Single Source of Truth: Expiry Status Calculator
 *
 * EVERY module must use these functions for expiry classification.
 * Do NOT create custom expiry logic anywhere else.
 *
 * Business Rules:
 * - daysLeft < 0  → EXPIRED
 * - daysLeft = 0  → EXPIRES TODAY (not yet expired)
 * - daysLeft > 0  → ACTIVE
 *
 * All date comparisons use date-only (no time component)
 * to avoid UTC/IST timezone bugs.
 */

/**
 * Get the expiry status for a given expiry date.
 * Uses date-only comparison to avoid timezone issues.
 *
 * @param {Date|string} expiryDate - The expiry date to evaluate
 * @returns {{ daysLeft: number, expired: boolean, expiresToday: boolean, expiring7: boolean, expiring30: boolean, expiring90: boolean }}
 */
export function getExpiryStatus(expiryDate) {
  const today = new Date();
  const todayDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  const exp = new Date(expiryDate);
  const expiryDateOnly = new Date(Date.UTC(exp.getFullYear(), exp.getMonth(), exp.getDate()));

  const daysLeft = Math.floor((expiryDateOnly - todayDate) / (1000 * 60 * 60 * 24));

  return {
    daysLeft,
    expired: daysLeft < 0,
    expiresToday: daysLeft === 0,
    expiring7: daysLeft >= 0 && daysLeft <= 7,
    expiring30: daysLeft >= 0 && daysLeft <= 30,
    expiring90: daysLeft >= 0 && daysLeft <= 90,
  };
}

/**
 * SQL fragment for expired batches.
 * Uses CURRENT_DATE (date-only, timezone-independent at DB level)
 * instead of NOW() (includes time component).
 *
 * An item is expired when its expiryDate is BEFORE today.
 * expiryDate = today means "expires today" = NOT yet expired.
 */
export const SQL_EXPIRED_CONDITION = `"expiryDate"::date < CURRENT_DATE`;

/**
 * SQL fragment for expiring within N days (not yet expired).
 */
export function sqlExpiringWithinDays(days) {
  return `"expiryDate"::date >= CURRENT_DATE AND "expiryDate"::date < CURRENT_DATE + INTERVAL '${days} days'`;
}

export default { getExpiryStatus, SQL_EXPIRED_CONDITION, sqlExpiringWithinDays };
