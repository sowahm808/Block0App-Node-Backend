export class AppError extends Error {
  constructor(
    public status: number,
    public title: string,
    message?: string,
    public code = 'app_error',
    public errors?: unknown,
  ) {
    super(message ?? title);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'Unauthorized', message, 'unauthorized');
  }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'Forbidden', message, 'forbidden');
  }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(409, 'Conflict', message, 'conflict');
  }
}
export class ValidationAppError extends AppError {
  constructor(errors: unknown) {
    super(400, 'Validation Failed', 'Request validation failed', 'validation_failed', errors);
  }
}
