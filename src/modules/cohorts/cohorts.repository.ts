import type { Firestore, Query, Transaction } from 'firebase-admin/firestore';
import { ConflictError, NotFoundError, UnprocessableEntityError } from '../common/errors.js';
import type { CohortStatus, CreateCohort, ListCohorts } from './cohorts.schemas.js';

const transitions: Record<CohortStatus, CohortStatus[]> = {
  draft: ['upcoming', 'enrollment_open', 'archived'],
  upcoming: ['enrollment_open', 'active', 'archived'],
  enrollment_open: ['upcoming', 'active', 'closed', 'archived'],
  active: ['paused', 'completed', 'closed'],
  paused: ['active', 'completed', 'closed'],
  completed: ['closed', 'archived'],
  closed: ['archived'],
  archived: [],
};

const validateDates = (value: Record<string, any>) => {
  const start = Date.parse(value.startsAtUtc);
  const end = Date.parse(value.endsAtUtc);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    throw new UnprocessableEntityError('startsAtUtc must be before endsAtUtc');
  const opens = value.enrollmentOpensAtUtc && Date.parse(value.enrollmentOpensAtUtc);
  const closes = value.enrollmentClosesAtUtc && Date.parse(value.enrollmentClosesAtUtc);
  if (opens && closes && opens >= closes)
    throw new UnprocessableEntityError('Enrollment opening must be before enrollment closing');
  if ((opens && opens > end) || (closes && closes > end))
    throw new UnprocessableEntityError('Enrollment dates must not be after the cohort ends');
};

const cursorEncode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const cursorDecode = (value: string) => {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    throw new UnprocessableEntityError('Invalid cursor');
  }
};

export class CohortsRepository {
  constructor(private readonly db: Firestore) {}
  private collection() {
    return this.db.collection('cohorts');
  }
  private normalize(doc: any) {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      scholarCount: data.scholarCount ?? 0,
      mentorCount: data.mentorCount ?? 0,
      learningPackCount: data.learningPackCount ?? 0,
    };
  }
  async list(input: ListCohorts) {
    let query: Query = this.collection();
    if (input.status) query = query.where('status', '==', input.status);
    else query = query.where('archived', '==', input.archived === 'true');
    if (input.challengeId) query = query.where('challengeId', '==', input.challengeId);
    if (input.mentorId) query = query.where('mentorIds', 'array-contains', input.mentorId);
    if (input.startsAfter) query = query.where('startsAtUtc', '>=', input.startsAfter);
    if (input.startsBefore) query = query.where('startsAtUtc', '<=', input.startsBefore);
    query = query.orderBy(input.sort, input.order).orderBy('__name__', input.order);
    if (input.cursor) {
      const cursor = cursorDecode(input.cursor);
      query = query.startAfter(cursor.value, cursor.id);
    }
    const snapshot = await query.limit(input.limit + 1).get();
    let rows = snapshot.docs.map((doc) => this.normalize(doc));
    if (input.search)
      rows = rows.filter((row: any) =>
        row.name?.toLowerCase().includes(input.search!.toLowerCase()),
      );
    if (input.capacityAvailable === 'true')
      rows = rows.filter((row: any) => row.scholarCount < row.capacity);
    if (input.capacityAvailable === 'false')
      rows = rows.filter((row: any) => row.scholarCount >= row.capacity);
    const hasMore = rows.length > input.limit;
    const items = rows.slice(0, input.limit);
    const last: any = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? cursorEncode({ value: last[input.sort], id: last.id }) : null,
    };
  }
  private async assertUnique(
    tx: Transaction,
    challengeId: string,
    name: string,
    exceptId?: string,
  ) {
    const found = await tx.get(
      this.collection()
        .where('challengeId', '==', challengeId)
        .where('nameNormalized', '==', name.trim().toLowerCase())
        .limit(2),
    );
    if (found.docs.some((doc) => doc.id !== exceptId))
      throw new ConflictError('A cohort with this name already exists for the challenge');
  }
  async create(input: CreateCohort, actorId: string) {
    validateDates(input);
    const ref = this.collection().doc();
    const now = new Date().toISOString();
    await this.db.runTransaction(async (tx) => {
      await this.assertUnique(tx, input.challengeId, input.name);
      tx.create(ref, {
        ...input,
        nameNormalized: input.name.toLowerCase(),
        status: 'draft',
        archived: false,
        scholarCount: 0,
        mentorCount: 0,
        learningPackCount: 0,
        version: 1,
        createdAtUtc: now,
        updatedAtUtc: now,
        createdBy: actorId,
        updatedBy: actorId,
      });
    });
    return this.normalize(await ref.get());
  }
  async update(id: string, patch: Record<string, any>, version: number, actorId: string) {
    const ref = this.collection().doc(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundError('Cohort not found');
      const old = snap.data()!;
      if (old.archived) throw new UnprocessableEntityError('Archived cohorts cannot be modified');
      if (old.version !== version) throw new ConflictError('Cohort version is stale');
      const value = { ...old, ...patch };
      validateDates(value);
      await this.assertUnique(tx, value.challengeId, value.name, id);
      tx.update(ref, {
        ...patch,
        ...(patch.name ? { nameNormalized: patch.name.toLowerCase() } : {}),
        version: version + 1,
        updatedAtUtc: new Date().toISOString(),
        updatedBy: actorId,
      });
    });
    return this.normalize(await ref.get());
  }
  async setStatus(id: string, status: CohortStatus, version: number, actorId: string) {
    const ref = this.collection().doc(id);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotFoundError('Cohort not found');
      const old = snap.data()!;
      if (old.archived) throw new UnprocessableEntityError('Archived cohorts cannot be modified');
      if (old.version !== version) throw new ConflictError('Cohort version is stale');
      if (!transitions[old.status as CohortStatus]?.includes(status))
        throw new UnprocessableEntityError(
          `Invalid cohort transition from ${old.status} to ${status}`,
        );
      tx.update(ref, {
        status,
        archived: status === 'archived',
        version: version + 1,
        updatedAtUtc: new Date().toISOString(),
        updatedBy: actorId,
      });
    });
    return this.normalize(await ref.get());
  }
  async duplicate(id: string, input: Record<string, any>, actorId: string) {
    const source = await this.collection().doc(id).get();
    if (!source.exists) throw new NotFoundError('Cohort not found');
    const data = source.data()!;
    return this.create(
      {
        name: input.name,
        challengeId: data.challengeId,
        challengeName: data.challengeName,
        timeZone: input.timeZone ?? data.timeZone,
        startsAtUtc: input.startsAtUtc,
        endsAtUtc: input.endsAtUtc,
        capacity: data.capacity,
      } as CreateCohort,
      actorId,
    );
  }
}
