export function sanitizeRedisPayload(obj) {
  return JSON.parse(JSON.stringify(obj, (_, value) => (value === undefined ? null : value)));
}
