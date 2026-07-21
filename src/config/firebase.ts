import admin from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { env } from './env.js';

export function initializeFirebase(): { app: admin.app.App; auth: Auth; db: Firestore } {
  const existing = admin.apps[0];
  const credential = env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : admin.credential.applicationDefault();
  const app = existing ?? admin.initializeApp({ credential, projectId: env.FIREBASE_PROJECT_ID });
  return { app, auth: admin.auth(app), db: admin.firestore(app) };
}
