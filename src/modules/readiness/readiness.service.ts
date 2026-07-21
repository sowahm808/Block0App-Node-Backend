import type { Firestore } from 'firebase-admin/firestore';
export class ReadinessService {
  constructor(private db: Firestore) {}
  async ready() {
    await this.db.collection('_health').limit(1).get();
    return { status: 'ready', firebase: true, firestore: true };
  }
  current(userId: string) {
    return {
      userId,
      challenge: '21-day medical exam preparation challenge',
      status: 'not_started',
      day: 0,
    };
  }
}
