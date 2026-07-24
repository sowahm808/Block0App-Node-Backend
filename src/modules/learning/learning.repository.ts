import type { Firestore } from 'firebase-admin/firestore';
import {
  learningSeedCollections,
  sampleChallengeDays,
  sampleChallenges,
  sampleDashboard,
  sampleLearningPacks,
  sampleCapsules,
  sampleQuestions,
  sampleQuestionExplanations,
  sampleCapsuleAttempts,
  sampleQuestionAttempts,
  sampleReadiness,
  sampleReadinessPrompts,
  sampleContentReviews,
  sampleRewards,
  sampleCertificates,
  sampleRaffleEntries,
  sampleSystemSettings,
  sampleResources,
  sampleTeams,
  sampleReviewScenarios,
  sampleAiDrafts,
  sampleReviewHistory,
  sampleSupportRequests,
} from './learning.seed.js';
import {
  importFailedSummary,
  validateLearningPackImport,
  type LearningPackImportPayload,
} from './content-import.js';
import type { CheckInInput } from './check-ins.schemas.js';

const clampPercentage = (value: unknown, fallback = 0) =>
  Math.min(Math.max(Math.round(Number(value) || fallback), 0), 100);

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any).toDate === 'function') return (value as any).toDate();
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
};

const removeUndefinedProperties = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : removeUndefinedProperties(item)));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, removeUndefinedProperties(entry)]),
    );
  }
  return value;
};

export class LearningRepository {
  constructor(private db: Firestore) {}

  async saveCheckIn(userId: string, input: CheckInInput) {
    const now = new Date().toISOString();
    const ref = this.db.collection('checkIns').doc();
    const checkIn = {
      id: ref.id,
      ...input,
      userId,
      createdAtUtc: now,
      updatedAtUtc: now,
    };
    await ref.set(checkIn);
    return checkIn;
  }

  async seedAll() {
    const seeded: Record<string, number> = {};
    for (const [collectionName, documents] of Object.entries(learningSeedCollections)) {
      const batch = this.db.batch();
      for (const document of documents) {
        batch.set(this.db.collection(collectionName).doc(document.id), document, { merge: true });
      }
      await batch.commit();
      seeded[collectionName] = documents.length;
    }
    return { seeded };
  }

  async listChallenges() {
    const snapshot = await this.db
      .collection('challenges')
      .where('status', '==', 'published')
      .get();
    const challenges = snapshot.docs.map((doc) => doc.data());
    return challenges.length ? challenges : sampleChallenges;
  }

  async getChallenge(slugOrId: string) {
    const byId = await this.db.collection('challenges').doc(slugOrId).get();
    if (byId.exists) return byId.data();

    const bySlug = await this.db
      .collection('challenges')
      .where('slug', '==', slugOrId)
      .limit(1)
      .get();
    if (!bySlug.empty) return bySlug.docs[0].data();

    return (
      sampleChallenges.find(
        (challenge) => challenge.id === slugOrId || challenge.slug === slugOrId,
      ) ?? null
    );
  }

  async getCurrentChallengeToday() {
    const dashboard = (await this.getDashboard()) as any;
    const challengeId = dashboard.activeChallengeId;
    const challenge = challengeId
      ? await this.getChallenge(challengeId)
      : (await this.listChallenges())[0];
    if (!challenge) return null;
    const days = await this.getChallengeDays(challenge.id);
    const dayNumber = Math.min(
      Math.max(Number(dashboard.currentDay) || 1, 1),
      Number(challenge.durationDays) || days.length || 1,
    );
    const day = days.find((item: any) => item.day === dayNumber) ?? days[0] ?? null;
    return {
      challenge,
      day,
      currentDay: dayNumber,
      totalDays: challenge.durationDays ?? days.length,
      dashboard,
    };
  }

  async getChallengeDays(challengeId: string) {
    const snapshot = await this.db
      .collection('challengeDays')
      .where('challengeId', '==', challengeId)
      .get();
    const days = snapshot.docs
      .map((doc) => doc.data())
      .sort((left: any, right: any) => (Number(left.day) || 0) - (Number(right.day) || 0));
    return days.length
      ? days
      : sampleChallengeDays.filter((day) => day.challengeId === challengeId);
  }

  async listResources() {
    const snapshot = await this.db.collection('resources').get();
    const resources = snapshot.docs.map((doc) => doc.data());
    return resources.length ? resources : sampleResources;
  }

  async listTeams() {
    const snapshot = await this.db.collection('teams').get();
    const teams = snapshot.docs.map((doc) => doc.data());
    return teams.length ? teams : sampleTeams;
  }

  async listRewards() {
    const snapshot = await this.db.collection('rewards').where('status', '==', 'active').get();
    const rewards = snapshot.docs.map((doc) => doc.data());
    return rewards.length ? rewards : sampleRewards;
  }

  async listCertificates() {
    const snapshot = await this.db.collection('certificates').get();
    const certificates = snapshot.docs.map((doc) => doc.data());
    return certificates.length ? certificates : sampleCertificates;
  }

  async listRaffleEntries() {
    const snapshot = await this.db.collection('raffleEntries').get();
    const raffleEntries = snapshot.docs.map((doc) => doc.data());
    return raffleEntries.length ? raffleEntries : sampleRaffleEntries;
  }

  async listLearningPacks() {
    const snapshot = await this.db
      .collection('learningPacks')
      .where('status', '==', 'published')
      .get();
    const learningPacks = snapshot.docs.map((doc) => doc.data());
    return learningPacks.length ? learningPacks : sampleLearningPacks;
  }

  async resumeCapsuleAttempt(capsuleAttemptId: string) {
    const attempt = await this.getById('capsuleAttempts', capsuleAttemptId, sampleCapsuleAttempts);
    if (!attempt) return null;
    const capsule = await this.getById('capsules', attempt.capsuleId, sampleCapsules);
    const questionAttempt = await this.getById(
      'questionAttempts',
      attempt.currentQuestionAttemptId,
      sampleQuestionAttempts,
    );
    const question = questionAttempt
      ? await this.getById('questions', questionAttempt.questionId, sampleQuestions)
      : null;
    if (!capsule || !questionAttempt || !question) return null;
    const w1Question = { ...(question as any) };
    delete w1Question.correctChoiceId;
    delete w1Question.correctRationale;
    delete w1Question.incorrectRationales;
    delete w1Question.explanation;
    return {
      capsuleAttemptId: attempt.id,
      capsule: { id: capsule.id, title: capsule.title, summary: capsule.summary },
      progress: { completedQuestions: attempt.completedQuestions, totalQuestions: 1 },
      questionAttemptId: questionAttempt.id,
      markedForReview: questionAttempt.markedForReview,
      question: w1Question,
    };
  }

  async submitQuestionAttempt(
    capsuleAttemptId: string,
    questionAttemptId: string,
    body: { choiceId: string; elapsedMs?: number; markedForReview?: boolean },
  ) {
    const attempt = await this.getById('capsuleAttempts', capsuleAttemptId, sampleCapsuleAttempts);
    const questionAttempt = await this.getById(
      'questionAttempts',
      questionAttemptId,
      sampleQuestionAttempts,
    );
    if (!attempt || !questionAttempt || questionAttempt.capsuleAttemptId !== capsuleAttemptId)
      return null;
    const explanation = (await this.getByField(
      'questionExplanations',
      'questionId',
      questionAttempt.questionId,
      sampleQuestionExplanations,
    )) as any;
    if (!explanation) return null;
    const correct = explanation.correctChoiceId === body.choiceId;
    await this.db
      .collection('questionAttempts')
      .doc(questionAttemptId)
      .set(
        {
          ...questionAttempt,
          choiceId: body.choiceId,
          elapsedMs: body.elapsedMs ?? null,
          markedForReview: body.markedForReview ?? questionAttempt.markedForReview,
          submittedAtUtc: new Date().toISOString(),
          correct,
        },
        { merge: true },
      );
    return {
      questionAttemptId,
      capsuleAttemptId,
      choiceId: body.choiceId,
      correct,
      correctChoiceId: explanation.correctChoiceId,
      correctRationale: explanation.correctRationale,
      incorrectRationales: explanation.incorrectRationales,
      reference: explanation.reference,
      memory: explanation.memory,
    };
  }

  async importLearningPack(payload: LearningPackImportPayload, importedBy: string) {
    const errors = validateLearningPackImport(payload);
    if (errors.length) return importFailedSummary(payload, importedBy, errors);
    let created = 0,
      updated = 0;
    const contentIds: string[] = [];
    const audit = {
      importedBy,
      importedAtUtc: new Date().toISOString(),
      sourceFileName: payload.sourceFileName ?? null,
    };
    const upsert = async (collectionName: string, id: string, data: any) => {
      const ref = this.db.collection(collectionName).doc(id);
      const exists = (await ref.get()).exists;
      if (exists) {
        updated++;
      } else {
        created++;
      }
      await ref.set(removeUndefinedProperties(data) as any, { merge: true });
      contentIds.push(id);
    };
    const packId = payload.learningPack.externalId;
    await upsert('learningPacks', packId, {
      id: packId,
      ...payload.learningPack,
      importAudit: audit,
    });
    for (const capsule of payload.capsules) {
      const capsuleId = capsule.externalId;
      const capsuleDocument: Record<string, unknown> = { ...capsule };
      delete capsuleDocument.questions;
      await upsert('capsules', capsuleId, {
        ...capsuleDocument,
        id: capsuleId,
        learningPackId: packId,
        importAudit: audit,
      });
      for (const question of capsule.questions) {
        const questionId = question.externalId;
        const { explanation, ...w1Question } = question;
        await upsert('questions', questionId, {
          ...w1Question,
          id: questionId,
          capsuleId,
          importAudit: audit,
        });
        await upsert('questionExplanations', `${questionId}-explanation`, {
          id: `${questionId}-explanation`,
          questionId,
          ...explanation,
          importAudit: audit,
        });
        await upsert('contentReviews', `review-${questionId}`, {
          id: `review-${questionId}`,
          entityType: 'question',
          entityId: questionId,
          status: payload.learningPack.status === 'draft' ? 'draft' : 'pending_review',
          reviewerId: null,
          notes: null,
          reviewedAtUtc: null,
          importAudit: audit,
        });
      }
    }
    return { created, updated, skipped: 0, failed: 0, errors: [], contentIds, audit };
  }

  async listReviewQuestions() {
    const snapshot = await this.db.collection('questions').get();
    const questions = snapshot.docs.map((doc) => doc.data());
    const sourceQuestions = questions.length ? questions : sampleQuestions;
    return Promise.all(
      sourceQuestions.map(async (question: any) => {
        const explanation = (await this.getByField(
          'questionExplanations',
          'questionId',
          question.id,
          sampleQuestionExplanations,
        )) as any;
        const review = (await this.getByField(
          'contentReviews',
          'entityId',
          question.id,
          sampleContentReviews,
        )) as any;
        return {
          ...question,
          review: review && review.entityType === 'question' ? review : null,
          explanation,
        };
      }),
    );
  }

  async listReviewContent() {
    const snapshot = await this.db.collection('contentReviews').get();
    const reviews = snapshot.docs.map((doc) => doc.data());
    const sourceReviews = reviews.length ? reviews : sampleContentReviews;
    return Promise.all(
      sourceReviews.map(async (review: any) => {
        const content = await this.getReviewEntity(review.entityType, review.entityId);
        return {
          ...review,
          content,
          title: content?.title ?? content?.stem ?? review.entityId,
        };
      }),
    );
  }

  async listReviewScenarios() {
    const snapshot = await this.db.collection('reviewScenarios').get();
    const scenarios = snapshot.docs.map((doc) => doc.data());
    return scenarios.length ? scenarios : sampleReviewScenarios;
  }

  async listAiDrafts() {
    const snapshot = await this.db.collection('aiDrafts').get();
    const drafts = snapshot.docs.map((doc) => doc.data());
    return drafts.length ? drafts : sampleAiDrafts;
  }

  async listReviewHistory() {
    const snapshot = await this.db.collection('reviewHistory').get();
    const history = snapshot.docs.map((doc) => doc.data());
    return history.length ? history : sampleReviewHistory;
  }

  async listSupportRequests() {
    const snapshot = await this.db.collection('supportRequests').get();
    const requests = snapshot.docs.map((doc) => doc.data());
    return requests.length ? requests : sampleSupportRequests;
  }

  async getDashboard() {
    const snapshot = await this.db.collection('dashboard').limit(1).get();
    return snapshot.empty ? sampleDashboard : snapshot.docs[0].data();
  }

  async getScholarDashboard(scholarId: string) {
    const dashboard = (await this.getDashboard()) as any;
    const enrollment = await this.getActiveEnrollment(scholarId);
    if (!enrollment) return { enrollmentState: 'not_enrolled' };

    const now = new Date();
    const startDate = toDate(enrollment.startDate ?? enrollment.startDateUtc);
    if (startDate && startDate.getTime() > now.getTime()) {
      return {
        enrollmentState: 'not_started',
        scholarName: enrollment.scholarName ?? dashboard.scholarName ?? null,
        currentChallenge: enrollment.challengeName ?? dashboard.currentChallenge ?? null,
        startDate: startDate.toISOString(),
        countdown: this.formatCountdown(startDate.getTime() - now.getTime()),
        preparationChecklist:
          enrollment.preparationChecklist ?? dashboard.preparationChecklist ?? [],
      };
    }

    if (['completed', 'complete'].includes(String(enrollment.status).toLowerCase())) {
      return {
        enrollmentState: 'completed',
        scholarName: enrollment.scholarName ?? dashboard.scholarName ?? null,
        currentChallenge: enrollment.challengeName ?? dashboard.currentChallenge ?? null,
        completionMessage:
          enrollment.completionMessage ?? dashboard.completionMessage ?? 'Challenge completed.',
        certificateStatus: enrollment.certificateStatus ?? dashboard.certificateStatus ?? 'pending',
        finalReadiness:
          enrollment.finalReadiness ?? dashboard.finalReadiness ?? dashboard.readinessLevel,
      };
    }

    const [checkIns, rewards, raffleEntries, activity] = await Promise.all([
      this.listScholarDocuments('checkIns', scholarId),
      this.listScholarDocuments('rewardsEarned', scholarId),
      this.listScholarDocuments('raffleEntries', scholarId),
      this.listScholarDocuments('activityFeed', scholarId),
    ]);
    const today = now.toISOString().slice(0, 10);
    const todaysCheckIns = checkIns.filter((item: any) =>
      String(item.createdAtUtc ?? item.date ?? '').startsWith(today),
    );
    const morningCheckInDone = todaysCheckIns.some((item: any) => item.type === 'morning');
    const eveningCheckInDone = todaysCheckIns.some((item: any) => item.type === 'evening');

    return {
      ...dashboard,
      enrollmentState: 'active',
      scholarName: enrollment.scholarName ?? dashboard.scholarName,
      currentChallenge: enrollment.challengeName ?? dashboard.currentChallenge,
      currentDay: enrollment.currentDay ?? dashboard.currentDay,
      dailyTarget: enrollment.dailyTarget ?? dashboard.dailyTarget ?? 15,
      dailyQuestionTarget: enrollment.dailyQuestionTarget ?? dashboard.dailyQuestionTarget ?? 60,
      capsulesCompletedToday:
        enrollment.capsulesCompletedToday ?? dashboard.capsulesCompletedToday ?? 0,
      questionsCompletedToday:
        enrollment.questionsCompletedToday ?? dashboard.questionsCompletedToday ?? 0,
      overallCompletion: clampPercentage(
        enrollment.overallCompletion ?? dashboard.overallCompletion,
      ),
      completedDays: enrollment.completedDays ?? dashboard.completedDays ?? 0,
      currentStreak: enrollment.currentStreak ?? dashboard.currentStreak ?? 0,
      academicScore: clampPercentage(dashboard.academicScore ?? dashboard.knowledgeAccuracy),
      engagementScore: clampPercentage(dashboard.engagementScore ?? dashboard.scenarioPerformance),
      readinessLastUpdated: dashboard.readinessLastUpdated ?? new Date().toISOString(),
      morningCheckInDone: dashboard.morningCheckInDone ?? morningCheckInDone,
      eveningCheckInDone: dashboard.eveningCheckInDone ?? eveningCheckInDone,
      rewardsEarned: dashboard.rewardsEarned ?? rewards.length,
      raffleEntries: dashboard.raffleEntries ?? raffleEntries.length,
      recentActivity:
        dashboard.recentActivity ?? activity.map((item: any) => item.message).filter(Boolean),
    };
  }

  private async getActiveEnrollment(scholarId: string) {
    const snapshot = await this.db
      .collection('enrollments')
      .where('scholarId', '==', scholarId)
      .get();
    const enrollments = snapshot.docs.map((doc) => doc.data() as any);
    return (
      enrollments.find((item) =>
        ['active', 'not_started', 'completed', 'complete'].includes(
          String(item.status).toLowerCase(),
        ),
      ) ?? null
    );
  }

  private async listScholarDocuments(collectionName: string, scholarId: string) {
    const snapshot = await this.db
      .collection(collectionName)
      .where('scholarId', '==', scholarId)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  private formatCountdown(milliseconds: number) {
    const days = Math.max(Math.ceil(milliseconds / 86400000), 0);
    return { days, label: days === 1 ? '1 day' : `${days} days` };
  }

  async getReadiness() {
    const snapshot = await this.db.collection('readiness').limit(1).get();
    return snapshot.empty ? sampleReadiness : snapshot.docs[0].data();
  }

  async getSystemSettings() {
    const byDefaultId = await this.db.collection('systemSettings').doc('default').get();
    if (byDefaultId.exists) return byDefaultId.data();

    const snapshot = await this.db.collection('systemSettings').limit(1).get();
    return snapshot.empty ? sampleSystemSettings : snapshot.docs[0].data();
  }

  private async getReviewEntity(entityType: string, entityId: string) {
    const collectionByType: Record<string, { collection: string; fallback: any[] }> = {
      learningPack: { collection: 'learningPacks', fallback: sampleLearningPacks },
      capsule: { collection: 'capsules', fallback: sampleCapsules },
      question: { collection: 'questions', fallback: sampleQuestions },
    };
    const source = collectionByType[entityType];
    return source ? this.getById(source.collection, entityId, source.fallback) : null;
  }

  private async getById(collectionName: string, id: string, fallback: any[]) {
    const document = await this.db.collection(collectionName).doc(id).get();
    return document.exists ? document.data() : (fallback.find((item) => item.id === id) ?? null);
  }

  private async getByField(collectionName: string, field: string, value: string, fallback: any[]) {
    const snapshot = await this.db
      .collection(collectionName)
      .where(field, '==', value)
      .limit(1)
      .get();
    return snapshot.empty
      ? (fallback.find((item) => item[field] === value) ?? null)
      : snapshot.docs[0].data();
  }

  async listAdminCollection(collectionName: string, query: Record<string, unknown> = {}) {
    const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const snapshot = await this.db.collection(collectionName).limit(limit).get();
    return {
      items: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      nextCursor: null,
    };
  }

  async saveAdminDocument(
    collectionName: string,
    payload: Record<string, unknown>,
    audit: { actorId: string },
  ) {
    const now = new Date().toISOString();
    const id =
      typeof payload.id === 'string' && payload.id.trim()
        ? payload.id.trim()
        : this.db.collection(collectionName).doc().id;
    const existing = await this.db.collection(collectionName).doc(id).get();
    const document = removeUndefinedProperties({
      ...payload,
      id,
      status: payload.status ?? 'draft',
      createdAtUtc: existing.exists ? (existing.data() as any)?.createdAtUtc : now,
      updatedAtUtc: now,
      audit: {
        updatedBy: audit.actorId,
        updatedAtUtc: now,
      },
    });
    await this.db
      .collection(collectionName)
      .doc(id)
      .set(document as any, { merge: true });
    return { ...(document as Record<string, unknown>), persisted: true };
  }

  async searchCertificates(query: Record<string, unknown> = {}) {
    const certificates = await this.listAdminCollection('certificates', query);
    return { ...certificates, audit: [] };
  }

  async recordCertificateOperation(payload: Record<string, unknown>, actorId: string) {
    const now = new Date().toISOString();
    const action = typeof payload.action === 'string' ? payload.action : 'search';
    const id =
      typeof payload.id === 'string' && payload.id.trim()
        ? payload.id.trim()
        : `certificate-operation-${Date.now()}`;
    const document = removeUndefinedProperties({
      ...payload,
      id,
      action,
      status: 'accepted',
      requestedBy: actorId,
      requestedAtUtc: now,
      updatedAtUtc: now,
    });
    await this.db
      .collection('certificateOperations')
      .doc(id)
      .set(document as any, { merge: true });
    return document;
  }

  async getSanitizedSystemSettings() {
    const settings = (await this.getSystemSettings()) as Record<string, unknown>;
    const secretPattern = /(secret|token|key|password|credential)/i;
    return Object.fromEntries(Object.entries(settings).filter(([key]) => !secretPattern.test(key)));
  }

  async listReadinessPrompts() {
    const snapshot = await this.db.collection('readinessPrompts').get();
    const prompts = snapshot.docs.map((doc) => doc.data());
    return prompts.length ? prompts : sampleReadinessPrompts;
  }
}
