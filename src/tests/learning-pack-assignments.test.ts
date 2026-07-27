import { describe, expect, it } from 'vitest';
import {
  bulkLearningPackAssignmentSchema,
  learningPackAssignmentSchema,
} from '../modules/learning/learning-pack-assignments.schemas.js';

describe('learning pack assignment request', () => {
  const validRequest = {
    learningPackId: 'pack-1',
    scholarIds: ['scholar-1', 'scholar-2'],
    startAtUtc: '2026-08-01T00:00:00.000Z',
    dueAtUtc: '2026-08-08T00:00:00.000Z',
    notes: 'Review before the cohort session.',
    idempotencyKey: '01f0dd9e-69d4-4fc0-8f56-66842800fc4e',
  };

  it('accepts a bounded, typed assignment request', () => {
    expect(learningPackAssignmentSchema.parse(validRequest)).toEqual(validRequest);
  });

  it('rejects duplicate scholars', () => {
    const result = learningPackAssignmentSchema.safeParse({
      ...validRequest,
      scholarIds: ['scholar-1', 'scholar-1'],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ['scholarIds'] });
  });

  it('rejects a due date before the start date', () => {
    const result = learningPackAssignmentSchema.safeParse({
      ...validRequest,
      dueAtUtc: '2026-07-31T23:59:59.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ['dueAtUtc'] });
  });
});

describe('bulk learning pack assignment request', () => {
  const validRequest = {
    scholarIds: ['scholar-1', 'scholar-2'],
    learningPackIds: ['pack-1', 'pack-2'],
    availableFromUtc: '2026-08-01T12:00:00.000Z',
    dueAtUtc: '2026-08-15T23:59:00.000Z',
    notes: '  Assigned after readiness review  ',
  };

  it('trims notes and accepts the bulk contract', () => {
    expect(bulkLearningPackAssignmentSchema.parse(validRequest).notes).toBe(
      'Assigned after readiness review',
    );
  });

  it.each([
    [{ ...validRequest, scholarIds: ['scholar-1', 'scholar-1'] }, 'scholar IDs'],
    [{ ...validRequest, learningPackIds: [] }, 'empty pack list'],
    [{ ...validRequest, availableFromUtc: '2026-08-01T12:00:00+01:00' }, 'non-UTC date'],
    [{ ...validRequest, dueAtUtc: validRequest.availableFromUtc }, 'equal dates'],
    [{ ...validRequest, notes: 'x'.repeat(501) }, 'long notes'],
  ])('rejects %s (%s)', (body) => {
    expect(bulkLearningPackAssignmentSchema.safeParse(body).success).toBe(false);
  });
});
