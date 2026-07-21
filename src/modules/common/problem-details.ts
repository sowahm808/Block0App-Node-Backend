import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ValidationAppError } from './errors.js';

export function problemDetails(error: Error, request: FastifyRequest) {
  const e = error instanceof ZodError ? new ValidationAppError(error.flatten()) : error;
  const app = e instanceof AppError ? e : undefined;
  return {
    type: `https://httpstatuses.com/${app?.status ?? 500}`,
    title: app?.title ?? 'Internal Server Error',
    status: app?.status ?? 500,
    detail: app?.message ?? 'An unexpected error occurred.',
    traceId: request.id,
    ...(app?.errors ? { errors: app.errors } : {}),
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
