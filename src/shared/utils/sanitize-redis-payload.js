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
 *  - Symbols    → string description
 *  - Functions  → null
 *  - Circular references → '[Circular]'
 *  - Prisma objects (other) → '[Object]'
 */
function deepSanitize(value, seen = new WeakSet()) {
  if (value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  
  // Prisma Decimal objects expose a toNumber() method
  if (value !== null && typeof value === 'object' && typeof value.toNumber === 'function') {
    return value.toNumber();
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(item => deepSanitize(item, seen));
  }
  
  // Handle objects
  if (value !== null && typeof value === 'object') {
    // Detect circular references
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepSanitize(val, seen);
    }
    return result;
  }
  
  return value;
}

export function sanitizeRedisPayload(obj) {
  return deepSanitize(obj);
}
