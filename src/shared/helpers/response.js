/**
 * Enterprise Standard API Response Contracts
 * Guarantees uniform JSON structure across all success and failure responses.
 */

export function success(data = {}, meta = {}, message = 'Operation completed successfully.') {
  const finalMeta = {
    requestId: meta.requestId || '',
    timestamp: meta.timestamp || new Date().toISOString(),
    ...meta,
  };
  return {
    success: true,
    message,
    data,
    meta: finalMeta,
  };
}

export function error(message, code = 'ERROR', details = [], meta = {}) {
  return {
    success: false,
    error: {
      code,
      message: message || 'An error occurred.',
      details: Array.isArray(details) ? details : details ? [details] : [],
      requestId: meta.requestId || '',
      timestamp: meta.timestamp || new Date().toISOString(),
    },
  };
}

export function paginated(
  data,
  pagination,
  meta = {},
  message = 'Operation completed successfully.',
) {
  const finalMeta = {
    requestId: meta.requestId || '',
    timestamp: meta.timestamp || new Date().toISOString(),
    ...meta,
  };
  return {
    success: true,
    message,
    data,
    pagination,
    meta: finalMeta,
  };
}
