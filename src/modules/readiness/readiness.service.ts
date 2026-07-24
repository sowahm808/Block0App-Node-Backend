import type { Firestore } from 'firebase-admin/firestore';

const formulaVersion = 'readiness-v1.0.0';
const readinessWindowDays = 21;

type ReadinessPayload = {
  readinessLevel: string;
  academicScore: number;
  engagementScore: number;
  lastCalculatedAt: string;
  formulaVersion: string;
  academicComponents: {
    knowledgeAccuracy: number;
    clinicalScenarioPerformance: number;
    rehearsalPerformance: number;
    topicCoverage: number;
    completion: number;
  };
  engagementComponents: {
    consistency: number;
    checkInParticipation: number;
    studyStreak: number;
    teamParticipation: number;
  };
  improvementActions: string[];
};

const clampScore = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));
const rounded = (value: number) => Math.round(clampScore(value));
const hasValue = (value: unknown) => value !== undefined && value !== null && value !== '';
const scoreFromRatio = (complete: number, total: number) =>
  total > 0 ? (complete / total) * 100 : 0;
const dateValue = (item: any) =>
  item.completedAtUtc ?? item.submittedAtUtc ?? item.createdAtUtc ?? item.date ?? item.checkInDate;

const academicComponentKeys = [
  'knowledgeAccuracy',
  'clinicalScenarioPerformance',
  'rehearsalPerformance',
  'topicCoverage',
  'completion',
] as const;
const engagementComponentKeys = [
  'consistency',
  'checkInParticipation',
  'studyStreak',
  'teamParticipation',
] as const;

export class ReadinessService {
  constructor(private db: Firestore) {}

  async ready() {
    await this.db.collection('_health').limit(1).get();
    return { status: 'ready', firebase: true, firestore: true };
  }

  async current(userId: string): Promise<ReadinessPayload | null> {
    const saved = await this.latestSavedCalculation(userId);
    if (saved) return this.normalizeSavedCalculation(saved);

    const [
      questionAttempts,
      scenarioAttempts,
      rehearsalAttempts,
      capsuleAttempts,
      checkIns,
      teamActions,
    ] = await Promise.all([
      this.listScholarDocuments('questionAttempts', userId),
      this.listScholarDocuments('scenarioAttempts', userId),
      this.listScholarDocuments('rehearsalAttempts', userId),
      this.listScholarDocuments('capsuleAttempts', userId),
      this.listScholarDocuments('checkIns', userId),
      this.listScholarDocuments('teamActions', userId),
    ]);

    const hasAcademicData =
      questionAttempts.length ||
      scenarioAttempts.length ||
      rehearsalAttempts.length ||
      capsuleAttempts.length;
    const hasEngagementData = checkIns.length || teamActions.length;
    if (!hasAcademicData && !hasEngagementData) return null;

    const correctQuestions = questionAttempts.filter(
      (attempt: any) => attempt.correct === true,
    ).length;
    const scoredScenarios = scenarioAttempts.filter((attempt: any) => hasValue(attempt.score));
    const scoredRehearsals = rehearsalAttempts.filter(
      (attempt: any) => hasValue(attempt.score) || hasValue(attempt.correct),
    );
    const completedCapsules = capsuleAttempts.filter(
      (attempt: any) => attempt.completedAtUtc || attempt.status === 'completed',
    ).length;
    const activeDates = new Set(
      [
        ...questionAttempts,
        ...scenarioAttempts,
        ...rehearsalAttempts,
        ...capsuleAttempts,
        ...checkIns,
        ...teamActions,
      ]
        .map((item: any) => String(dateValue(item) ?? '').slice(0, 10))
        .filter(Boolean),
    );

    const academicComponents = {
      knowledgeAccuracy: rounded(scoreFromRatio(correctQuestions, questionAttempts.length)),
      clinicalScenarioPerformance: rounded(
        scoredScenarios.reduce((sum: number, item: any) => sum + clampScore(item.score), 0) /
          (scoredScenarios.length || 1),
      ),
      rehearsalPerformance: rounded(
        scoredRehearsals.reduce(
          (sum: number, item: any) =>
            sum + (hasValue(item.score) ? clampScore(item.score) : item.correct ? 100 : 0),
          0,
        ) / (scoredRehearsals.length || 1),
      ),
      topicCoverage: rounded(
        scoreFromRatio(
          new Set(
            capsuleAttempts
              .map((item: any) => item.topicId ?? item.topic ?? item.capsuleId)
              .filter(Boolean),
          ).size,
          10,
        ),
      ),
      completion: rounded(
        scoreFromRatio(
          completedCapsules +
            scoredScenarios.length +
            scoredRehearsals.length +
            questionAttempts.length,
          capsuleAttempts.length +
            scenarioAttempts.length +
            rehearsalAttempts.length +
            questionAttempts.length,
        ),
      ),
    };

    const expectedCheckIns = Math.max(activeDates.size * 2, checkIns.length);
    const currentStreak = this.currentStreak(activeDates);
    const engagementComponents = {
      consistency: rounded(scoreFromRatio(activeDates.size, readinessWindowDays)),
      checkInParticipation: rounded(scoreFromRatio(checkIns.length, expectedCheckIns)),
      studyStreak: rounded(scoreFromRatio(Math.min(currentStreak, 7), 7)),
      teamParticipation: rounded(scoreFromRatio(teamActions.length, Math.max(activeDates.size, 1))),
    };

    const academicScore = rounded(
      Object.values(academicComponents).reduce((sum, value) => sum + value, 0) / 5,
    );
    const engagementScore = rounded(
      Object.values(engagementComponents).reduce((sum, value) => sum + value, 0) / 4,
    );

    return {
      readinessLevel: this.readinessLevel(academicScore, engagementScore),
      academicScore,
      engagementScore,
      lastCalculatedAt: new Date().toISOString(),
      formulaVersion,
      academicComponents,
      engagementComponents,
      improvementActions: this.improvementActions(academicComponents, engagementComponents),
    };
  }

  private async latestSavedCalculation(userId: string) {
    const snapshot = await this.db
      .collection('readinessCalculations')
      .where('scholarId', '==', userId)
      .orderBy('lastCalculatedAt', 'desc')
      .limit(1)
      .get()
      .catch(async () =>
        this.db.collection('readinessCalculations').where('scholarId', '==', userId).limit(1).get(),
      );
    return snapshot.empty ? null : snapshot.docs[0].data();
  }

  private async listScholarDocuments(collectionName: string, scholarId: string) {
    const snapshot = await this.db
      .collection(collectionName)
      .where('scholarId', '==', scholarId)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  private normalizeSavedCalculation(data: any): ReadinessPayload {
    return {
      readinessLevel:
        data.readinessLevel ??
        this.readinessLevel(clampScore(data.academicScore), clampScore(data.engagementScore)),
      academicScore: clampScore(data.academicScore),
      engagementScore: clampScore(data.engagementScore),
      lastCalculatedAt: new Date(
        data.lastCalculatedAt ?? data.createdAtUtc ?? Date.now(),
      ).toISOString(),
      formulaVersion: data.formulaVersion ?? formulaVersion,
      academicComponents: this.normalizeComponents(data.academicComponents, academicComponentKeys),
      engagementComponents: this.normalizeComponents(
        data.engagementComponents,
        engagementComponentKeys,
      ),
      improvementActions: Array.isArray(data.improvementActions) ? data.improvementActions : [],
    };
  }

  private normalizeComponents<T extends readonly string[]>(components: any, keys: T) {
    return Object.fromEntries(keys.map((key) => [key, clampScore(components?.[key])])) as Record<
      T[number],
      number
    >;
  }

  private readinessLevel(academicScore: number, engagementScore: number) {
    if (academicScore < 60) return 'Needs focused review';
    if (academicScore < 75)
      return engagementScore >= 80 ? 'Building readiness with strong habits' : 'Building readiness';
    if (academicScore < 90) return 'On track';
    return 'Ready for exam-style performance';
  }

  private improvementActions(
    academic: ReadinessPayload['academicComponents'],
    engagement: ReadinessPayload['engagementComponents'],
  ) {
    const actions: string[] = [];
    if (academic.knowledgeAccuracy < 70)
      actions.push('Review missed and marked questions by topic');
    if (academic.clinicalScenarioPerformance < 70) actions.push('Complete two pending scenarios');
    if (academic.rehearsalPerformance < 70) actions.push('Revisit weak-topic rehearsals');
    if (academic.topicCoverage < 70) actions.push('Complete uncovered Block Zero topics');
    if (academic.completion < 70)
      actions.push('Finish assigned questions, scenarios, and rehearsals');
    if (engagement.consistency < 70) actions.push('Improve daily consistency');
    if (engagement.checkInParticipation < 70) actions.push('Submit morning and evening check-ins');
    if (engagement.teamParticipation < 70)
      actions.push('Participate with your accountability team');
    return actions.slice(0, 4);
  }

  private currentStreak(dates: Set<string>) {
    let streak = 0;
    const cursor = new Date();
    while (dates.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return streak;
  }
}
