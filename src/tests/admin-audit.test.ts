import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { sanitizeAuditDocument, sanitizeAuditValue } from '../modules/audit/audit.sanitizer.js';

const token = (permissions: string[]) =>
  Buffer.from(JSON.stringify({ uid: 'admin-1', email: 'admin@example.com', permissions })).toString(
    'base64url',
  );
const authService = {
  async verifyAccessToken(value: string) {
    return JSON.parse(Buffer.from(value, 'base64url').toString());
  },
};
const readiness = {
  async ready() {
    return { status: 'ready' };
  },
};

describe('admin audit API', () => {
  it('requires independent read and export permissions', async () => {
    const audit = {
      list: vi.fn(async () => ({ items: [], nextCursor: null })),
      detail: vi.fn(),
      append: vi.fn(),
    };
    const app = await buildApp({ authService, audit, readiness, sessions: {} });
    expect((await app.inject({ url: '/api/v1/admin/audit' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/audit',
          headers: { authorization: `Bearer ${token(['audit.export'])}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/audit/export',
          headers: { authorization: `Bearer ${token(['audit.read'])}` },
        })
      ).statusCode,
    ).toBe(403);
    await app.close();
  });

  it('exports safe CSV and records the export', async () => {
    const audit = {
      list: vi.fn(async () => ({
        items: [
          {
            createdAtUtc: '2026-01-01T00:00:00Z',
            actorDisplayName: '=cmd',
            metadata: { secret: 'no' },
            ipAddress: '1.2.3.4',
          },
        ],
        nextCursor: null,
      })),
      detail: vi.fn(),
      append: vi.fn(async () => ({})),
    };
    const app = await buildApp({ authService, audit, readiness, sessions: {} });
    const response = await app.inject({
      url: '/api/v1/admin/audit/export',
      headers: { authorization: `Bearer ${token(['audit.export'])}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("'=cmd");
    expect(response.body).not.toContain('1.2.3.4');
    expect(response.body).not.toContain('metadata');
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: 'audit.export' }));
    await app.close();
  });

  it('recursively redacts secrets and removes network context', () => {
    expect(
      sanitizeAuditValue({ nested: [{ password: 'x', authorizationHeader: 'Bearer x' }] }),
    ).toEqual({ nested: [{ password: '[REDACTED]', authorizationHeader: '[REDACTED]' }] });
    expect(
      sanitizeAuditDocument('event-1', { ipAddress: '1.2.3.4', userAgent: 'browser', notes: 'ok' }),
    ).toEqual({ id: 'event-1', notes: 'ok' });
  });

  it('returns Problem Details for invalid ranges and IDs', async () => {
    const audit = { list: vi.fn(), detail: vi.fn(), append: vi.fn() };
    const app = await buildApp({ authService, audit, readiness, sessions: {} });
    const headers = {
      authorization: `Bearer ${token(['audit.read'])}`,
      'x-correlation-id': 'audit-test',
    };
    const range = await app.inject({
      url: '/api/v1/admin/audit?start=2026-02-01T00:00:00Z&end=2026-01-01T00:00:00Z',
      headers,
    });
    expect(range.statusCode).toBe(422);
    expect(range.json()).toMatchObject({ status: 422, correlationId: 'audit-test' });
    expect((await app.inject({ url: '/api/v1/admin/audit/bad%20id', headers })).statusCode).toBe(
      422,
    );
    await app.close();
  });
});
