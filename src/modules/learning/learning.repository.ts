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

const PROGRAM_PHASES = [
  {
    id: 'knowledge-mastery',
    title: 'Knowledge mastery',
    dayStart: 1,
    dayEnd: 14,
    metrics: ['Learning-pack count', 'Question count', 'Daily target'],
  },
  {
    id: 'clinical-scenarios',
    title: 'Clinical scenarios',
    dayStart: 15,
    dayEnd: 18,
    metrics: ['Scenario volume', 'Daily target'],
  },
  {
    id: 'rehearsal',
    title: 'Rehearsal',
    dayStart: 19,
    dayEnd: 20,
    metrics: ['Weak-topic review', 'Marked questions'],
  },
  {
    id: 'rest',
    title: 'Rest',
    dayStart: 21,
    dayEnd: 21,
    metrics: ['Rest', 'Exam preparation', 'Final readiness'],
  },
];

const SCENARIO_VOLUMES: Record<number, number> = { 15: 10, 16: 20, 17: 40, 18: 60 };

const isoOrUndefined = (value: unknown) => toDate(value)?.toISOString();

const dayStartInTimeZoneUtc = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`);
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

  async getCurrentChallengeToday(scholarId?: string) {
    const dashboard = (await this.getDashboard()) as any;
    const enrollment = scholarId ? await this.getActiveEnrollment(scholarId) : null;
    const challengeId = enrollment?.challengeId ?? dashboard.activeChallengeId;
    const challenge = challengeId
      ? await this.getChallenge(challengeId)
      : (await this.listChallenges())[0];
    if (!challenge) return null;

    const days = await this.getChallengeDays(challenge.id);
    const dayNumber = Math.min(
      Math.max(Number(enrollment?.currentDay ?? dashboard.currentDay) || 1, 1),
      Number(challenge.durationDays) || days.length || 1,
    );
    const day = (days.find((item: any) => item.day === dayNumber) ?? days[0] ?? null) as any;
    const cohortTimeZone =
      enrollment?.cohortTimeZone ?? enrollment?.timeZone ?? dashboard.cohortTimeZone ?? 'UTC';
    const releaseAtUtc =
      day?.releaseAtUtc ?? enrollment?.releaseAtUtc ?? dashboard.releaseAtUtc ?? null;
    const releaseDate = toDate(releaseAtUtc);
    const isLocked = !!releaseDate && releaseDate.getTime() > Date.now();
    const currentStreak = Number(enrollment?.currentStreak ?? dashboard.currentStreak) || 0;

    if (isLocked) {
      return {
        studyDay: dayNumber,
        phaseTitle: day?.phaseTitle ?? dashboard.phaseTitle ?? this.phaseTitleForDay(dayNumber),
        dailyTitle: day?.lockedTitle ?? `Day ${dayNumber} content pending release`,
        encouragementMessage:
          day?.lockedEncouragementMessage ?? 'Today’s plan will unlock on the cohort schedule.',
        administrativeAnnouncement:
          day?.lockedAdministrativeAnnouncement ?? 'Check back at the release time below.',
        teamProgressMessage:
          day?.lockedTeamProgressMessage ?? 'Team progress starts after release.',
        targetCapsules: 0,
        targetQuestions: 0,
        targetStudyMinutes: 0,
        completionPercentage: 0,
        currentStreak,
        morningCheckInDone: false,
        eveningCheckInDone: false,
        assignedLearningPacks: [],
        locked: true,
        releaseAtUtc: releaseDate.toISOString(),
        cohortTimeZone,
      };
    }

    const packs = await this.getLearningPacksForDay(challenge.id, dayNumber, dashboard);
    const checkIns = scholarId ? await this.listScholarDocuments('checkIns', scholarId) : [];
    const today = new Date().toISOString().slice(0, 10);
    const todaysCheckIns = checkIns.filter((item: any) =>
      String(item.createdAtUtc ?? item.date ?? '').startsWith(today),
    );
    const morningCheckInDone = todaysCheckIns.some((item: any) => item.type === 'morning');
    const eveningCheckInDone = todaysCheckIns.some((item: any) => item.type === 'evening');
    const assignedLearningPacks = await Promise.all(
      packs.map(async (pack: any, index) => {
        const capsules = await this.listCapsulesForPack(pack.id);
        const attempts = scholarId
          ? await this.listScholarDocuments('capsuleAttempts', scholarId)
          : sampleCapsuleAttempts;
        const completedCapsules = capsules.filter((capsule: any) =>
          attempts.some(
            (attempt: any) =>
              attempt.capsuleId === capsule.id &&
              (attempt.completedAtUtc || attempt.status === 'complete'),
          ),
        ).length;
        const capsuleCount = Number(pack.capsuleCount ?? capsules.length) || 0;
        return {
          id: pack.id,
          packNumber: Number(pack.packNumber ?? pack.dayPackNumber ?? index + 1),
          title: pack.title,
          topic: pack.topic ?? pack.description ?? '',
          capsuleCount,
          completedCapsules,
          status:
            completedCapsules >= capsuleCount && capsuleCount > 0
              ? 'Complete'
              : completedCapsules > 0
                ? 'In progress'
                : 'Not started',
          continueUrl: pack.continueUrl ?? `/learning-packs/${pack.id}`,
        };
      }),
    );
    const targetCapsules = Number(day?.targetCapsules ?? dashboard.dailyTarget) || 0;
    const targetQuestions = Number(day?.targetQuestions ?? dashboard.dailyQuestionTarget) || 0;
    const targetStudyMinutes = Number(day?.targetStudyMinutes ?? day?.estimatedMinutes ?? 0) || 0;
    const completedCapsules = assignedLearningPacks.reduce(
      (sum, pack) => sum + pack.completedCapsules,
      0,
    );
    const completionPercentage = clampPercentage(
      dashboard.overallCompletion ??
        (targetCapsules ? (completedCapsules / targetCapsules) * 100 : 0),
    );

    return {
      studyDay: dayNumber,
      phaseTitle: day?.phaseTitle ?? dashboard.phaseTitle ?? this.phaseTitleForDay(dayNumber),
      dailyTitle: day?.dailyTitle ?? day?.title ?? `Day ${dayNumber} Challenge`,
      encouragementMessage: day?.encouragementMessage ?? dashboard.latestEncouragement ?? '',
      administrativeAnnouncement:
        day?.administrativeAnnouncement ?? dashboard.administrativeAnnouncement ?? '',
      teamProgressMessage:
        day?.teamProgressMessage ??
        `${dashboard.teamName ?? 'Team'} is ${Number(dashboard.teamDailyCompletion) || 0}% complete for today.`,
      targetCapsules,
      targetQuestions,
      targetStudyMinutes,
      completionPercentage,
      currentStreak,
      morningCheckInDone: dashboard.morningCheckInDone ?? morningCheckInDone,
      eveningCheckInDone: dashboard.eveningCheckInDone ?? eveningCheckInDone,
      continueUrl:
        dashboard.continueUrl ?? assignedLearningPacks[0]?.continueUrl ?? '/learning-packs',
      currentCapsuleUrl: dashboard.currentCapsuleUrl ?? dashboard.continueUrl ?? undefined,
      locked: false,
      assignedLearningPacks,
    };
  }

  async getCurrentChallengeProgram(scholarId?: string) {
    const dashboard = (await this.getDashboard()) as any;
    const enrollment = scholarId ? await this.getActiveEnrollment(scholarId) : null;
    const challengeId = enrollment?.challengeId ?? dashboard.activeChallengeId;
    const challenge = challengeId
      ? await this.getChallenge(challengeId)
      : (await this.listChallenges())[0];
    if (!challenge) return null;

    const timezone =
      enrollment?.cohortTimeZone ?? enrollment?.timeZone ?? dashboard.cohortTimeZone ?? 'UTC';
    const currentDay = this.programCurrentDay(enrollment, dashboard, timezone);
    const [
      challengeDays,
      learningPacks,
      questionAttempts,
      scenarioAssignments,
      scenarioAttempts,
      reviewQueues,
      dayProgress,
    ] = await Promise.all([
      this.getChallengeDays(challenge.id),
      this.listLearningPacksForChallenge(challenge.id),
      scholarId
        ? this.listScholarDocuments('questionAttempts', scholarId)
        : Promise.resolve(sampleQuestionAttempts),
      this.listChallengeCollection('scenarioAssignments', challenge.id),
      scholarId ? this.listScholarDocuments('scenarioAttempts', scholarId) : Promise.resolve([]),
      scholarId ? this.listScholarDocuments('reviewQueues', scholarId) : Promise.resolve([]),
      scholarId ? this.listScholarDocuments('dayProgress', scholarId) : Promise.resolve([]),
    ]);

    const days = Array.from({ length: 21 }, (_, index) => {
      const dayNumber = index + 1;
      const dayDefinition =
        (challengeDays as any[]).find(
          (day: any) => Number(day.day ?? day.dayNumber) === dayNumber,
        ) ?? {};
      const progress =
        (dayProgress as any[]).find(
          (item: any) => Number(item.dayNumber ?? item.day) === dayNumber,
        ) ?? {};
      const availableAtUtc = isoOrUndefined(
        dayDefinition.releaseAtUtc ??
          dayDefinition.availableAtUtc ??
          progress.availableAtUtc ??
          this.releaseForProgramDay(enrollment, dashboard, dayNumber, timezone),
      );
      const locked = !!availableAtUtc && new Date(availableAtUtc).getTime() > Date.now();
      const completedAtUtc = isoOrUndefined(
        progress.completedAtUtc ?? progress.completedAt ?? dayDefinition.completedAtUtc,
      );
      const dayPacks = (learningPacks as any[]).filter(
        (pack) => Number(pack.dayNumber ?? pack.studyDay) === dayNumber,
      );
      const activityType = this.programActivityType(dayNumber);
      const workload = this.programWorkload(
        dayNumber,
        dayPacks,
        questionAttempts as any[],
        scenarioAssignments as any[],
        scenarioAttempts as any[],
        reviewQueues as any[],
        progress,
      );
      const completionPercent = completedAtUtc
        ? 100
        : clampPercentage(
            progress.completionPercent ??
              progress.completionPercentage ??
              workload.completionPercent,
          );
      const status = this.programDayStatus(
        dayNumber,
        currentDay,
        completionPercent,
        locked,
        completedAtUtc,
      );
      return removeUndefinedProperties({
        dayNumber,
        activityType,
        status,
        completionPercent,
        locked,
        ...workload.fields,
        dailyTarget: workload.dailyTarget,
        focus: workload.focus,
        availableAtUtc,
        completedAtUtc,
      });
    }) as any[];

    const phases = PROGRAM_PHASES.map((phase) => {
      const phaseDays = days.filter(
        (day) => day.dayNumber >= phase.dayStart && day.dayNumber <= phase.dayEnd,
      );
      return {
        ...phase,
        completionPercent: clampPercentage(
          phaseDays.reduce((sum, day) => sum + Number(day.completionPercent || 0), 0) /
            phaseDays.length,
        ),
      };
    });

    return {
      challengeId: challenge.id,
      challengeName:
        enrollment?.challengeName ?? (challenge as any).programName ?? (challenge as any).title,
      currentDay,
      overallCompletion: clampPercentage(
        enrollment?.overallCompletion ??
          dashboard.overallCompletion ??
          days.reduce((sum, day) => sum + Number(day.completionPercent || 0), 0) / days.length,
      ),
      timezone,
      phases,
      days,
    };
  }

  private async getLearningPacksForDay(challengeId: string, dayNumber: number, dashboard: any) {
    const snapshot = await this.db
      .collection('learningPacks')
      .where('challengeId', '==', challengeId)
      .get();
    const packs = snapshot.docs.map((doc) => doc.data() as any);
    const matching = packs.filter((pack) => Number(pack.dayNumber ?? pack.studyDay) === dayNumber);
    if (matching.length) return matching;
    const seeded = sampleLearningPacks.filter(
      (pack: any) =>
        pack.challengeId === challengeId && Number(pack.dayNumber ?? pack.studyDay) === dayNumber,
    );
    if (seeded.length) return seeded;
    return sampleLearningPacks.filter((pack: any) =>
      (dashboard.assignedLearningPacks ?? []).some(
        (assigned: any) => assigned.externalId === pack.id || assigned.learningPackId === pack.id,
      ),
    );
  }

  private async listCapsulesForPack(learningPackId: string) {
    const snapshot = await this.db
      .collection('capsules')
      .where('learningPackId', '==', learningPackId)
      .get();
    const capsules = snapshot.docs.map((doc) => doc.data() as any);
    return capsules.length
      ? capsules
      : sampleCapsules.filter((capsule: any) => capsule.learningPackId === learningPackId);
  }

  private phaseTitleForDay(dayNumber: number) {
    if (dayNumber <= 7) return 'Foundation';
    if (dayNumber <= 14) return 'Systems Review';
    return 'Integration';
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

  private async listLearningPacksForChallenge(challengeId: string) {
    const snapshot = await this.db
      .collection('learningPacks')
      .where('challengeId', '==', challengeId)
      .get();
    const packs = snapshot.docs.map((doc) => doc.data() as any);
    return packs.length
      ? packs
      : sampleLearningPacks.filter((pack: any) => pack.challengeId === challengeId);
  }

  private async listChallengeCollection(collectionName: string, challengeId: string) {
    const snapshot = await this.db
      .collection(collectionName)
      .where('challengeId', '==', challengeId)
      .get();
    return snapshot.docs.map((doc) => doc.data());
  }

  private programCurrentDay(enrollment: any, dashboard: any, timezone: string) {
    const explicitDay = Number(enrollment?.currentDay ?? dashboard.currentDay);
    const startDate = toDate(
      enrollment?.startDate ?? enrollment?.startDateUtc ?? enrollment?.cohortStartDateUtc,
    );
    if (!startDate) return Math.min(Math.max(explicitDay || 1, 1), 21);
    const startLocal = dayStartInTimeZoneUtc(startDate, timezone).getTime();
    const nowLocal = dayStartInTimeZoneUtc(new Date(), timezone).getTime();
    const extensionDays = Number(enrollment?.extensionDays ?? enrollment?.extensionsDays) || 0;
    return Math.min(
      Math.max(Math.floor((nowLocal - startLocal) / 86400000) + 1 - extensionDays, 1),
      21,
    );
  }

  private releaseForProgramDay(
    enrollment: any,
    dashboard: any,
    dayNumber: number,
    timezone: string,
  ) {
    const schedule = enrollment?.releaseSchedule ?? dashboard.releaseSchedule;
    const scheduled = Array.isArray(schedule)
      ? schedule.find((item: any) => Number(item.dayNumber ?? item.day) === dayNumber)
      : null;
    if (scheduled?.availableAtUtc || scheduled?.releaseAtUtc) {
      return scheduled.availableAtUtc ?? scheduled.releaseAtUtc;
    }
    const startDate = toDate(
      enrollment?.startDate ?? enrollment?.startDateUtc ?? enrollment?.cohortStartDateUtc,
    );
    if (!startDate) return undefined;
    const startLocal = dayStartInTimeZoneUtc(startDate, timezone);
    return new Date(startLocal.getTime() + (dayNumber - 1) * 86400000).toISOString();
  }

  private programActivityType(dayNumber: number) {
    if (dayNumber <= 14) return 'Knowledge mastery';
    if (dayNumber <= 18) return 'Clinical scenarios';
    if (dayNumber <= 20) return 'Rehearsal';
    return 'Rest';
  }

  private programWorkload(
    dayNumber: number,
    dayPacks: any[],
    questionAttempts: any[],
    scenarioAssignments: any[],
    scenarioAttempts: any[],
    reviewQueues: any[],
    progress: any,
  ) {
    if (dayNumber <= 14) {
      const learningPackCount = Number((progress.learningPackCount ?? dayPacks.length) || 3);
      const questionCount = Number(
        (progress.questionCount ??
          dayPacks.reduce(
            (sum, pack) => sum + Number(pack.questionCount ?? pack.targetQuestions ?? 0),
            0,
          )) ||
          60,
      );
      const completedQuestions = questionAttempts.filter(
        (attempt) =>
          Number(attempt.dayNumber ?? attempt.day) === dayNumber &&
          (attempt.submittedAtUtc || attempt.completedAtUtc || attempt.correct !== undefined),
      ).length;
      return {
        fields: { learningPackCount, questionCount },
        dailyTarget: `${learningPackCount} learning packs • ${questionCount} questions`,
        focus: ['Knowledge mastery', 'Learning-pack count', 'Question count', 'Daily target'],
        completionPercent: questionCount ? (completedQuestions / questionCount) * 100 : 0,
      };
    }
    if (dayNumber <= 18) {
      const assigned = scenarioAssignments.find(
        (item) => Number(item.dayNumber ?? item.day) === dayNumber,
      );
      const scenarioVolume = Number(
        progress.scenarioVolume ??
          assigned?.scenarioVolume ??
          assigned?.volume ??
          SCENARIO_VOLUMES[dayNumber],
      );
      const completedScenarios = scenarioAttempts.filter(
        (attempt) =>
          Number(attempt.dayNumber ?? attempt.day) === dayNumber &&
          (attempt.completedAtUtc || attempt.submittedAtUtc || attempt.status === 'complete'),
      ).length;
      return {
        fields: { scenarioVolume },
        dailyTarget: `${scenarioVolume} clinical scenarios`,
        focus: ['Clinical scenarios', 'Scenario volume', 'Daily target'],
        completionPercent: scenarioVolume ? (completedScenarios / scenarioVolume) * 100 : 0,
      };
    }
    if (dayNumber <= 20) {
      const queue =
        reviewQueues.find((item) => Number(item.dayNumber ?? item.day) === dayNumber) ?? {};
      return {
        fields: {},
        dailyTarget: 'Weak-topic review • Marked questions',
        focus: ['Rehearsal', 'Weak-topic review', 'Marked questions'],
        completionPercent: progress.completionPercent ?? queue.completionPercent ?? 0,
      };
    }
    return {
      fields: {},
      dailyTarget: 'Rest • Exam preparation • Final readiness',
      focus: ['Rest', 'Exam preparation', 'Final readiness'],
      completionPercent: 0,
    };
  }

  private programDayStatus(
    dayNumber: number,
    currentDay: number,
    completionPercent: number,
    locked: boolean,
    completedAtUtc?: string,
  ) {
    if (dayNumber === 21) return 'Rest Day';
    if (completedAtUtc || completionPercent >= 100) return 'Completed';
    if (locked || dayNumber > currentDay) return 'Upcoming';
    if (dayNumber < currentDay) return 'Missed';
    if (completionPercent > 0) return 'In Progress';
    return 'Available';
  }

  async listReadinessPrompts() {
    const snapshot = await this.db.collection('readinessPrompts').get();
    const prompts = snapshot.docs.map((doc) => doc.data());
    return prompts.length ? prompts : sampleReadinessPrompts;
  }
}
