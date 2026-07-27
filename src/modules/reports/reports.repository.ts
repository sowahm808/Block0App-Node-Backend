import type { Firestore, Query } from 'firebase-admin/firestore';
import type { ReportCategory, ReportListResponse, ReportQuery } from './reports.schemas.js';

const collections: Record<ReportCategory, string> = {
  scholars: 'scholarReportSummaries',
  cohorts: 'cohortReportSummaries',
  challenges: 'challengeReportSummaries',
  'learning-packs': 'learningPackReportSummaries',
  questions: 'questionReportSummaries',
};

const publicRow = (id: string, data: Record<string, unknown>) => {
  const safe = { ...data };
  for (const privateField of [
    'uid',
    'firebaseUid',
    'authClaims',
    'tokenMetadata',
    'securityState',
    'auditPayload',
  ]) {
    delete safe[privateField];
  }
  return { id, ...safe };
};

export class ReportsRepository {
  constructor(private readonly db: Firestore) {}

  async overview(query: ReportQuery) {
    void query;
    const snapshot = await this.db.collection('reportSnapshots').doc('overview').get();
    if (!snapshot.exists) {
      return {
        counts: {},
        rates: {},
        completionTrend: [],
        assignmentStatus: [],
        challengeOptions: [],
        cohortOptions: [],
        updatedAtUtc: new Date().toISOString(),
      };
    }
    return snapshot.data();
  }

  async list(category: ReportCategory, filters: ReportQuery): Promise<ReportListResponse> {
    const [sortField, direction] = filters.sort.split(':') as [string, 'asc' | 'desc'];
    let query: Query = this.db.collection(collections[category]);
    for (const field of ['challengeId', 'cohortId', 'status'] as const) {
      if (filters[field]) query = query.where(field, '==', filters[field]);
    }
    if (filters.scholarSearch) {
      const prefix = filters.scholarSearch.trim().toLocaleLowerCase('en-US');
      query = query.where('searchPrefixes', 'array-contains', prefix);
    }
    query = query
      .orderBy(sortField, direction)
      .orderBy('__name__', direction)
      .limit(filters.pageSize);
    if (filters.cursor) {
      const decoded = JSON.parse(
        Buffer.from(filters.cursor, 'base64url').toString('utf8'),
      ) as unknown[];
      query = query.startAfter(...decoded);
    }
    const result = await query.get();
    const items = result.docs.map((doc) => publicRow(doc.id, doc.data()));
    const last = result.docs.at(-1);
    const nextCursor =
      result.size === filters.pageSize && last
        ? Buffer.from(JSON.stringify([last.get(sortField), last.id])).toString('base64url')
        : null;
    const timestamps = items
      .map((item: any) => item.updatedAtUtc)
      .filter(Boolean)
      .sort();
    return {
      items,
      total: Number(result.docs[0]?.get('reportTotal') ?? items.length),
      nextCursor,
      updatedAtUtc: timestamps[0] ?? new Date().toISOString(),
    };
  }
}
