import admin from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';

import { env } from './env.js';

export function initializeFirebase(): {
  app: admin.app.App;
  auth: Auth;
  db: Firestore;
  storage: Storage;
  storageBucket?: string;
} {
  const existingApp = admin.apps[0];

  if (existingApp) {
    return {
      app: existingApp,
      auth: admin.auth(existingApp),
      db: admin.firestore(existingApp),
      storage: admin.storage(existingApp),
      storageBucket: env.FIREBASE_STORAGE_BUCKET,
    };
  }

  const projectId = env.FIREBASE_PROJECT_ID;
  const clientEmail = env.FIREBASE_CLIENT_EMAIL;
  const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!env.firebaseConfigured && env.NODE_ENV !== 'test') {
    throw new Error(
      'Firebase Admin configuration is incomplete. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required.',
    );
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin configuration is incomplete. ' +
        'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required.',
    );
  }

  const app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    projectId,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });

  return {
    app,
    auth: admin.auth(app),
    db: admin.firestore(app),
    storage: admin.storage(app),
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  };
}
