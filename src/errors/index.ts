export class AppError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = new.target.name;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429);
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Database error") {
    super(message, 500);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message = "External service error") {
    super(message, 502);
  }
}

export const isAppError = (error: unknown): error is AppError =>
  error instanceof AppError;
