import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';

const principal = {
  uid: 'mentor-1',
  permissions: ['mentor.teams.read'],
  roles: ['Mentor'],
  tenantId: 'tenant-1',
};

const authService = {
  verifyAccessToken: vi.fn(async (value: string) => {
    if (value === 'invalid') throw new Error('invalid');
    if (value === 'forbidden') return { ...principal, permissions: [] };
    return principal;
  }),
};

const request = (url: string, token = 'valid') => ({
  method: 'GET' as const,
  url,
  headers: { authorization: `Bearer ${token}` },
});

const testApp = (overrides: Record<string, unknown> = {}) =>
  buildApp({
    authService,
    sessions: {},
    readiness: { ready: async () => ({ status: 'ready' }) },
    ...overrides,
  });

describe('mentor teams contract', () => {
  it('returns the scoped, canonical paginated collection', async () => {
    const list = vi.fn(async (_user, input) => ({
      items: [
        {
          id: 'foundations-cohort',
          name: 'Foundations cohort',
          status: 'active',
          memberCount: 12,
          needsAttentionCount: 2,
        },
      ],
      page: input.page,
      pageSize: input.pageSize,
      total: 1,
    }));
    const app = await testApp({ mentorTeams: { list, detail: vi.fn() } });
    const response = await app.inject(
      request('/api/v1/mentor/teams?status=active&page=1&pageSize=24'),
    );
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({ page: 1, pageSize: 24, total: 1 });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ uid: 'mentor-1' }), {
      status: 'active',
      page: 1,
      pageSize: 24,
    });
  });

  it('returns an empty collection as 200', async () => {
    const app = await testApp();
    const response = await app.inject(request('/api/v1/mentor/teams'));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], page: 1, pageSize: 24, total: 0 });
  });

  it.each([
    ['/api/v1/mentor/teams?page=zero', 'valid', 400, 'VALIDATION_ERROR'],
    ['/api/v1/mentor/teams', 'invalid', 401, 'UNAUTHENTICATED'],
    ['/api/v1/mentor/teams', 'forbidden', 403, 'FORBIDDEN'],
  ])('returns a stable error envelope for %s', async (url, token, status, code) => {
    const app = await testApp();
    const response = await app.inject(request(url, token));
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({
      error: { code, message: expect.any(String), requestId: expect.any(String) },
    });
  });

  it('conceals an unassigned detail ID with 404', async () => {
    const app = await testApp({
      mentorTeams: { list: vi.fn(), detail: vi.fn(async () => null) },
    });
    const response = await app.inject(request('/api/v1/mentor/teams/another-tenant'));
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('TEAM_NOT_FOUND');
  });

  it('maps repository failures to 503 without leaking details', async () => {
    const app = await testApp({
      mentorTeams: {
        list: vi.fn(async () => {
          throw new Error('database credentials leaked');
        }),
        detail: vi.fn(),
      },
    });
    const response = await app.inject(request('/api/v1/mentor/teams'));
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('database credentials');
    expect(response.json().error.code).toBe('MENTOR_TEAMS_UNAVAILABLE');
  });
});
