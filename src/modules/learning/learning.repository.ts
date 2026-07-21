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
  sampleResources,
  sampleTeams,
} from './learning.seed.js';
import {
  importFailedSummary,
  validateLearningPackImport,
  type LearningPackImportPayload,
} from './content-import.js';

export class LearningRepository {
  constructor(private db: Firestore) {}

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

  async getChallengeDays(challengeId: string) {
    const snapshot = await this.db
      .collection('challengeDays')
      .where('challengeId', '==', challengeId)
      .orderBy('day')
      .get();
    const days = snapshot.docs.map((doc) => doc.data());
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
      await ref.set(data, { merge: true });
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
      await upsert('capsules', capsuleId, {
        ...capsule,
        id: capsuleId,
        learningPackId: packId,
        questions: undefined,
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

  async getDashboard() {
    const snapshot = await this.db.collection('dashboard').limit(1).get();
    return snapshot.empty ? sampleDashboard : snapshot.docs[0].data();
  }

  async getReadiness() {
    const snapshot = await this.db.collection('readiness').limit(1).get();
    return snapshot.empty ? sampleReadiness : snapshot.docs[0].data();
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

  async listReadinessPrompts() {
    const snapshot = await this.db.collection('readinessPrompts').get();
    const prompts = snapshot.docs.map((doc) => doc.data());
    return prompts.length ? prompts : sampleReadinessPrompts;
  }
}
