/**
 * Base error class for application-specific errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class InventoryError extends AppError {
  constructor(message) {
    super(message, 400, 'INVENTORY_ERROR');
  }
}

export class PaymentError extends AppError {
  constructor(message) {
    super(message, 400, 'PAYMENT_ERROR');
  }
}

export class SubscriptionError extends AppError {
  constructor(message) {
    super(message, 403, 'SUBSCRIPTION_ERROR');
  }
}
