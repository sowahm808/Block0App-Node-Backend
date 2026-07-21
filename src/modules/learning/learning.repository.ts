import type { Firestore } from 'firebase-admin/firestore';
import {
  learningSeedCollections,
  sampleChallengeDays,
  sampleChallenges,
  sampleDashboard,
  sampleLearningPacks,
  sampleReadiness,
  sampleReadinessPrompts,
  sampleResources,
  sampleTeams,
} from './learning.seed.js';

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
    const snapshot = await this.db.collection('learningPacks').get();
    const learningPacks = snapshot.docs.map((doc) => doc.data());
    return learningPacks.length ? learningPacks : sampleLearningPacks;
  }

  async getDashboard() {
    const snapshot = await this.db.collection('dashboard').limit(1).get();
    return snapshot.empty ? sampleDashboard : snapshot.docs[0].data();
  }

  async getReadiness() {
    const snapshot = await this.db.collection('readiness').limit(1).get();
    return snapshot.empty ? sampleReadiness : snapshot.docs[0].data();
  }

  async listReadinessPrompts() {
    const snapshot = await this.db.collection('readinessPrompts').get();
    const prompts = snapshot.docs.map((doc) => doc.data());
    return prompts.length ? prompts : sampleReadinessPrompts;
  }
}
