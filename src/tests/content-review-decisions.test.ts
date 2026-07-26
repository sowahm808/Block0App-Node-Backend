import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

const reviewer = { uid: 'reviewer-1', permissions: ['content.review'] };
const authService = {
  async verifyAccessToken(value: string) {
    if (value === 'reviewer') return reviewer;
    if (value === 'learner') return { uid: 'learner-1', permissions: ['scholar:access'] };
    throw new Error('invalid token');
  },
};

class MemoryLearning {
  reviews = new Map<string, any>();
  publications = new Map<string, string>();
  healthCalls = 0;

  async seedAll() {}
  async listReviewContent() {
    return [...this.reviews.values()];
  }
  async listReviewQuestions() {
    return [];
  }
  async listReviewScenarios() {
    return [];
  }
  async getDashboard() {
    return {};
  }
  async listChallenges() {
    return [];
  }
  async listTeams() {
    return [];
  }
  async listLearningPacks() {
    return [];
  }
  async findContentReviewById(id: string) {
    return this.reviews.get(id) ?? null;
  }

  async decideContentReview(
    id: string,
    status: string,
    notes: string,
    reviewerId: string,
    expectedVersion?: number,
  ) {
    const review = this.reviews.get(id);
    if (!review) return { outcome: 'not_found' };
    if (['approved', 'rejected'].includes(review.status)) return { outcome: 'invalid_transition' };
    if (expectedVersion !== undefined && expectedVersion !== review.version) {
      return { outcome: 'conflict' };
    }
    const updated = {
      ...review,
      status,
      notes,
      reviewerId,
      reviewedAtUtc: new Date().toISOString(),
      version: review.version + 1,
    };
    this.reviews.set(id, updated);
    return { outcome: 'updated', review: updated };
  }
}

const baseReview = (id = 'review-LP01-C01-Q01') => ({
  id,
  entityType: 'question',
  entityId: 'LP01-C01-Q01',
  status: 'draft',
  title: 'In the medical term cardiology...',
  notes: '',
  reviewerId: null,
  reviewedAtUtc: null,
  version: 2,
  content: {
    stem: 'In the medical term cardiology...',
    choices: [{ id: 'A', label: 'A', text: 'cardi' }],
    explanation: { correctChoiceId: 'a' },
  },
});

describe('content review decisions', () => {
  let learning: MemoryLearning;

  beforeEach(() => {
    learning = new MemoryLearning();
  });

  async function app() {
    return buildApp({
      authService,
      learning,
      seedLearning: false,
      sessions: {},
      readiness: { ready: async () => ({ status: 'ready' }) },
    });
  }

  it.each([
    ['approve', 'approved', ''],
    ['request-changes', 'changes_requested', ' Please clarify the rationale. '],
    ['reject', 'rejected', ' Citation is not approved. '],
  ])('persists the %s decision and returns the exact DTO', async (action, status, notes) => {
    const review = baseReview();
    learning.reviews.set(review.id, review);
    learning.publications.set(review.entityId, 'draft');
    const server = await app();

    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/review/content/${review.id}/${action}`,
      headers: { authorization: 'Bearer reviewer', 'if-match': '"2"' },
      payload: { notes, reviewerId: undefined },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: review.id,
      status,
      notes: notes.trim(),
      reviewerId: reviewer.uid,
      version: 3,
      content: {
        choices: [{ id: 'A' }],
        explanation: { correctChoiceId: 'a' },
      },
    });
    expect(response.json().data.reviewedAtUtc).toMatch(/Z$/);
    expect(learning.publications.get(review.entityId)).toBe('draft');
  });

  it.each(['request-changes', 'reject'])('requires non-blank notes for %s', async (action) => {
    const review = baseReview();
    learning.reviews.set(review.id, review);
    const response = await (
      await app()
    ).inject({
      method: 'POST',
      url: `/api/v1/review/content/${review.id}/${action}`,
      headers: { authorization: 'Bearer reviewer' },
      payload: { notes: '   ' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('enforces authentication, permission, ID/body validation, and routing isolation', async () => {
    const review = baseReview();
    learning.reviews.set(review.id, review);
    const server = await app();
    const decision = `/api/v1/review/content/${review.id}/approve`;

    expect((await server.inject({ method: 'POST', url: decision, payload: {} })).statusCode).toBe(
      401,
    );
    expect(
      (
        await server.inject({
          method: 'POST',
          url: decision,
          headers: { authorization: 'Bearer learner' },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: '/api/v1/review/content/%2E%2E%2Fhealth/approve',
          headers: { authorization: 'Bearer reviewer' },
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await server.inject({
          method: 'POST',
          url: decision,
          headers: { authorization: 'Bearer reviewer' },
          payload: { notes: 42 },
        })
      ).statusCode,
    ).toBe(400);
    expect(learning.healthCalls).toBe(0);
  });

  it('returns 404, detects stale versions, blocks final transitions, and prevents spoofing', async () => {
    const review = baseReview();
    learning.reviews.set(review.id, review);
    const server = await app();
    const headers = { authorization: 'Bearer reviewer' };

    const missing = await server.inject({
      method: 'POST',
      url: '/api/v1/review/content/review-missing/approve',
      headers,
      payload: {},
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers['content-type']).toContain('application/problem+json');

    const stale = await server.inject({
      method: 'POST',
      url: `/api/v1/review/content/${review.id}/approve`,
      headers: { ...headers, 'if-match': '1' },
      payload: {},
    });
    expect(stale.statusCode).toBe(409);

    const approved = await server.inject({
      method: 'POST',
      url: `/api/v1/review/content/${review.id}/approve`,
      headers,
      payload: { notes: '', reviewerId: 'spoofed' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().data.reviewerId).toBe(reviewer.uid);
    const finalTransition = await server.inject({
      method: 'POST',
      url: `/api/v1/review/content/${review.id}/reject`,
      headers,
      payload: { notes: 'No' },
    });
    expect(finalTransition.statusCode).toBe(422);
  });
});
