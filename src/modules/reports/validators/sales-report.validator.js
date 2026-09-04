export function validateSalesReportRequest(body) {
  const errors = {};

  if (!body || typeof body !== 'object') {
    return {
      isValid: false,
      message: 'Invalid request payload',
      errors: { body: 'Request body must be a JSON object' },
    };
  }

  const { fromDate, toDate, paymentMethod, status, search } = body;

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (
    !fromDate ||
    typeof fromDate !== 'string' ||
    !dateRegex.test(fromDate) ||
    isNaN(Date.parse(fromDate))
  ) {
    errors.fromDate = 'fromDate is required and must be a valid date in YYYY-MM-DD format';
  }

  if (
    !toDate ||
    typeof toDate !== 'string' ||
    !dateRegex.test(toDate) ||
    isNaN(Date.parse(toDate))
  ) {
    errors.toDate = 'toDate is required and must be a valid date in YYYY-MM-DD format';
  }

  if (fromDate && toDate && !errors.fromDate && !errors.toDate) {
    if (fromDate > toDate) {
      errors.fromDate = 'fromDate must be before or equal to toDate';
    }
  }

  if (paymentMethod === undefined || paymentMethod === null || typeof paymentMethod !== 'string') {
    errors.paymentMethod = 'paymentMethod is required and must be a string';
  }

  if (status === undefined || status === null || typeof status !== 'string') {
    errors.status = 'status is required and must be a string';
  }

  if (search === undefined || search === null || typeof search !== 'string') {
    errors.search = 'search is required and must be a string';
  } else if (search.length > 255) {
    errors.search = 'search string must not exceed 255 characters';
  }

  const isValid = Object.keys(errors).length === 0;
  const message = isValid
    ? 'Validation successful'
    : errors.fromDate && errors.fromDate.includes('before or equal')
      ? 'Invalid date range'
      : 'Validation failed';

  return {
    isValid,
    message,
    errors,
  };
}
