import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const token = (permissions: string[]) =>
  Buffer.from(JSON.stringify({ uid: 'admin-1', permissions })).toString('base64url');
const authService = {
  async verifyAccessToken(value: string) {
    return JSON.parse(Buffer.from(value, 'base64url').toString());
  },
};
const reports = {
  async overview() {
    return {
      counts: {},
      rates: { completionRate: null },
      completionTrend: [],
      assignmentStatus: [],
      challengeOptions: [],
      cohortOptions: [],
      updatedAtUtc: '2026-07-27T12:00:00.000Z',
    };
  },
  async list(_category: string, query: any) {
    return {
      items: [],
      total: 0,
      nextCursor: null,
      updatedAtUtc: '2026-07-27T12:00:00.000Z',
      receivedPageSize: query.pageSize,
    };
  },
};
const readiness = {
  async ready() {
    return { status: 'ready' };
  },
};
const sessions = {};

describe('admin reports', () => {
  it('requires authentication and the category permission', async () => {
    const app = await buildApp({ authService, reports, readiness, sessions });
    expect((await app.inject({ url: '/api/v1/admin/reports/scholars' })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/reports/scholars',
          headers: { authorization: `Bearer ${token(['reports.read'])}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: '/api/v1/admin/reports/scholars',
          headers: { authorization: `Bearer ${token(['*'])}` },
        })
      ).statusCode,
    ).toBe(200);
    await app.close();
  });

  it('returns the canonical empty wrapper', async () => {
    const app = await buildApp({ authService, reports, readiness, sessions });
    const response = await app.inject({
      url: '/api/v1/admin/reports/cohorts?pageSize=50',
      headers: { authorization: `Bearer ${token(['reports.cohort.read'])}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [],
      total: 0,
      nextCursor: null,
      receivedPageSize: 50,
    });
    await app.close();
  });

  it.each([
    'endAtUtc=2026-07-27T12%3A00%3A00.000Z',
    'startAtUtc=2026-07-28T12%3A00%3A00.000Z&endAtUtc=2026-07-27T12%3A00%3A00.000Z',
    'startAtUtc=2025-01-01T00%3A00%3A00.000Z&endAtUtc=2026-07-27T00%3A00%3A00.000Z',
    'challengeId=invalid%2Fid',
    'pageSize=101',
    'sort=uid%3Aasc',
  ])('returns Problem Details 422 for invalid filters: %s', async (query) => {
    const app = await buildApp({ authService, reports, readiness, sessions });
    const response = await app.inject({
      url: `/api/v1/admin/reports/challenges?${query}`,
      headers: {
        authorization: `Bearer ${token(['reports.challenge.read'])}`,
        'x-correlation-id': 'reports-test',
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 422, correlationId: 'reports-test' });
    await app.close();
  });
});
