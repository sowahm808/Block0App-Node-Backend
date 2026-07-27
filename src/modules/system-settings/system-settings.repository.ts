import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { ConflictError, AppError } from '../common/errors.js';
import {
  defaultSystemSettings,
  editableSettingsSchema,
  SYSTEM_SETTINGS_SCHEMA_VERSION,
  type EditableSystemSettings,
} from './system-settings.schemas.js';

export type SettingsRecord = EditableSystemSettings & {
  schemaVersion: number;
  version: number;
  updatedAtUtc: string | null;
  updatedBy: string | null;
};
export type SettingsActor = { uid: string; displayName?: string; email?: string };

export class SettingsVersionConflictError extends ConflictError {
  constructor(public readonly currentVersion: number) {
    super('The settings were changed after you loaded them. Reload and try again.');
    this.title = 'Settings changed by another administrator';
    this.code = 'settings_version_conflict';
    this.errors = { version: [`Current version is ${currentVersion}`], currentVersion };
  }
}

export function migrateSettings(source: Record<string, unknown> | undefined): SettingsRecord {
  if (!source)
    return {
      ...structuredClone(defaultSystemSettings),
      schemaVersion: SYSTEM_SETTINGS_SCHEMA_VERSION,
      version: 0,
      updatedAtUtc: null,
      updatedBy: null,
    };
  const schemaVersion = Number(source.schemaVersion ?? 0);
  if (schemaVersion > SYSTEM_SETTINGS_SCHEMA_VERSION)
    throw new AppError(
      500,
      'Unsupported settings schema',
      'The stored settings were written by a newer server.',
      'settings_schema_unsupported',
    );
  let value: Record<string, unknown> = structuredClone(source);
  // v0 was the original flat seed. Migration is deliberately pure and idempotent.
  if (schemaVersion === 0)
    value = {
      ...structuredClone(defaultSystemSettings),
      general: {
        ...defaultSystemSettings.general,
        applicationName: source.appName ?? defaultSystemSettings.general.applicationName,
        supportEmail: source.supportEmail ?? defaultSystemSettings.general.supportEmail,
      },
      enrollment: {
        ...defaultSystemSettings.enrollment,
        registrationEnabled:
          source.registrationEnabled ?? defaultSystemSettings.enrollment.registrationEnabled,
        requireEmailVerification:
          source.emailVerificationRequired ??
          defaultSystemSettings.enrollment.requireEmailVerification,
      },
      maintenance: {
        ...defaultSystemSettings.maintenance,
        enabled: source.maintenanceMode ?? false,
      },
      schemaVersion: 1,
      version: Number(source.version ?? 0),
      updatedAtUtc: source.updatedAtUtc ?? null,
      updatedBy: source.updatedBy ?? null,
    };
  const categories = Object.fromEntries(
    Object.keys(defaultSystemSettings).map((key) => [
      key,
      { ...(defaultSystemSettings as any)[key], ...((value as any)[key] ?? {}) },
    ]),
  );
  const parsed = editableSettingsSchema.safeParse(categories);
  if (!parsed.success)
    throw new AppError(
      500,
      'Settings migration failed',
      'Stored settings could not be safely migrated.',
      'settings_migration_failed',
    );
  return {
    ...parsed.data,
    schemaVersion: SYSTEM_SETTINGS_SCHEMA_VERSION,
    version: Number(value.version ?? 0),
    updatedAtUtc: typeof value.updatedAtUtc === 'string' ? value.updatedAtUtc : null,
    updatedBy: typeof value.updatedBy === 'string' ? value.updatedBy : null,
  };
}

export class SystemSettingsRepository {
  private readonly ref;
  constructor(
    private readonly db: Firestore,
    collection = 'adminSettings',
  ) {
    this.ref = db.collection(collection).doc('global');
  }
  async get(): Promise<SettingsRecord> {
    const snap = await this.ref.get();
    return migrateSettings(snap.exists ? snap.data() : undefined);
  }
  async transact(
    expectedVersion: number,
    next: EditableSystemSettings,
    actor: SettingsActor,
    event: {
      category: string;
      changedFields: string[];
      result: string;
      correlationId: string;
      action: string;
    },
  ): Promise<SettingsRecord> {
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(this.ref);
      const current = migrateSettings(snap.exists ? snap.data() : undefined);
      if (current.version !== expectedVersion)
        throw new SettingsVersionConflictError(current.version);
      const version = current.version + 1;
      const now = new Date().toISOString();
      const stored = {
        ...next,
        schemaVersion: SYSTEM_SETTINGS_SCHEMA_VERSION,
        version,
        updatedAtUtc: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      };
      const auditRef = this.db.collection('auditLogs').doc();
      tx.set(this.ref, stored);
      tx.create(auditRef, {
        eventId: auditRef.id,
        action: event.action,
        category: 'system-settings',
        settingsCategory: event.category,
        outcome: event.result,
        actorId: actor.uid,
        actorDisplayName: actor.displayName ?? '',
        actorEmail: actor.email ?? '',
        changedFields: event.changedFields,
        oldVersion: current.version,
        newVersion: version,
        correlationId: event.correlationId,
        createdAtUtc: now,
        source: 'server',
      });
      return {
        ...next,
        schemaVersion: SYSTEM_SETTINGS_SCHEMA_VERSION,
        version,
        updatedAtUtc: now,
        updatedBy: actor.uid,
      };
    });
  }
  async history(limit: number, cursor?: string) {
    let query: any = this.db
      .collection('auditLogs')
      .where('category', '==', 'system-settings')
      .orderBy('createdAtUtc', 'desc')
      .orderBy('__name__', 'desc')
      .limit(limit);
    if (cursor) {
      const doc = await this.db.collection('auditLogs').doc(cursor).get();
      if (doc.exists) query = query.startAfter(doc);
    }
    const snapshot = await query.get();
    return {
      items: snapshot.docs.map((doc: any) => {
        const d = doc.data();
        return {
          id: doc.id,
          occurredAtUtc: d.createdAtUtc,
          administrator: d.actorDisplayName || d.actorEmail || d.actorId || 'Unknown administrator',
          category: d.settingsCategory ?? 'all',
          changedFields: Array.isArray(d.changedFields) ? d.changedFields : [],
          result: d.outcome ?? 'unknown',
        };
      }),
      nextCursor: snapshot.size === limit ? (snapshot.docs.at(-1)?.id ?? null) : null,
    };
  }
}
