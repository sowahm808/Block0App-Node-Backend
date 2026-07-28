import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ValidationAppError } from './errors.js';

const correlationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Accept a caller's correlation ID only when it is safe to place in logs and headers.
 * Invalid, ambiguous, and multi-value headers deliberately fall back to a server ID.
 */
export function sanitizedCorrelationId(value: unknown, fallback: () => string): string {
  if (typeof value !== 'string') return fallback();
  const candidate = value.trim();
  return correlationIdPattern.test(candidate) ? candidate : fallback();
}

export function problemDetails(error: Error, request: FastifyRequest) {
  const e = error instanceof ZodError ? new ValidationAppError(error.flatten()) : error;
  const app = e instanceof AppError ? e : undefined;
  const fastifyStatus =
    'statusCode' in e && typeof e.statusCode === 'number' ? e.statusCode : undefined;
  const validationErrors = 'validation' in e ? e.validation : undefined;
  const status = app?.status ?? fastifyStatus ?? 500;
  const isValidation = Boolean(validationErrors);
  const title =
    app?.title ??
    (isValidation
      ? 'Validation Failed'
      : status === 429
        ? 'Too Many Requests'
        : 'Internal Server Error');
  const type =
    app?.code === 'account_disabled'
      ? 'https://api.blockzero.example/problems/account-disabled'
      : app?.code === 'content_review_not_found'
        ? 'https://api.blockzero.example/problems/content-review-not-found'
        : `https://httpstatuses.com/${status}`;
  const fieldErrors = app?.errors ?? validationErrors ?? {};
  return {
    code: app?.code ?? (isValidation ? 'validation_failed' : `http_${status}`),
    type,
    title,
    status,
    detail:
      app?.message ??
      (isValidation ? 'Request validation failed' : (e.message ?? 'An unexpected error occurred.')),
    message:
      app?.message ??
      (isValidation ? 'Request validation failed' : (e.message ?? 'An unexpected error occurred.')),
    traceId: request.id,
    correlationId: request.id,
    fieldErrors,
    instance: request.url.replace(/(\/public\/whispers\/unwrap\/)[^/?]+/i, '$1[redacted]'),
    ...(app?.errors ? { errors: app.errors, validationErrors: app.errors } : {}),
    ...(validationErrors ? { errors: validationErrors, validationErrors } : {}),
  };
}
export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const body = problemDetails(error, request);
  request.log[body.status >= 500 ? 'error' : 'warn'](
    { err: error, traceId: request.id },
    body.title,
  );
  await reply
    .header('x-correlation-id', request.id)
    .status(body.status)
    .type('application/problem+json')
    .send(body);
}
