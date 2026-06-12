/**
 * Sanitize a payload so every value is a Redis-safe primitive (string, number, boolean, null).
 *
 * Handles:
 *  - undefined  → null
 *  - BigInt     → string
 *  - Date       → ISO string
 *  - Buffer     → base64 string
 *  - Prisma Decimal (has .toNumber()) → number
 *  - NaN / Infinity → null
 */
export function sanitizeRedisPayload(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (value === undefined) return null;
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Date) return value.toISOString();
      if (Buffer.isBuffer(value)) return value.toString('base64');
      // Prisma Decimal objects expose a toNumber() method
      if (value !== null && typeof value === 'object' && typeof value.toNumber === 'function') {
        return value.toNumber();
      }
      if (typeof value === 'number' && !Number.isFinite(value)) return null;
      return value;
    }),
  );
}
