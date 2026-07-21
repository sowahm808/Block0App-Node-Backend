import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ValidationAppError } from './errors.js';

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
  return {
    type: `https://httpstatuses.com/${status}`,
    title,
    status,
    detail:
      app?.message ??
      (isValidation ? 'Request validation failed' : (e.message ?? 'An unexpected error occurred.')),
    traceId: request.id,
    ...(app?.errors ? { errors: app.errors } : {}),
    ...(validationErrors ? { errors: validationErrors } : {}),
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
  await reply.status(body.status).type('application/problem+json').send(body);
}
