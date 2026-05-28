export function success(data, meta) {
  const res = { success: true, data };
  if (meta) res.meta = meta;
  return res;
}

export function error(message, code) {
  return {
    success: false,
    error: { message, code: code || 'ERROR' },
  };
}

export function paginated(data, pagination) {
  return { success: true, data, pagination };
}
