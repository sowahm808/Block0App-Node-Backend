import { UnprocessableEntityError } from '../common/errors.js';
import type { Env } from '../../config/env.js';
import { defaultSystemSettings, type EditableSystemSettings } from './system-settings.schemas.js';
import type {
  SettingsActor,
  SettingsRecord,
  SystemSettingsRepository,
} from './system-settings.repository.js';

const pathsChanged = (before: unknown, after: unknown, prefix = ''): string[] => {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [prefix];
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).flatMap((key) =>
    pathsChanged((before as any)[key], (after as any)[key], prefix ? `${prefix}.${key}` : key),
  );
};

export class SystemSettingsService {
  constructor(
    private readonly repository: Pick<SystemSettingsRepository, 'get' | 'transact' | 'history'>,
    private readonly environment: Env,
  ) {}
  private providerStatus() {
    const emailConfigured =
      this.environment.EMAIL_PROVIDER === 'firebase' || Boolean(this.environment.RESEND_API_KEY);
    return {
      email: { configured: emailConfigured, healthy: emailConfigured },
      sms: { configured: false, healthy: false },
      push: {
        configured: Boolean(this.environment.FIREBASE_PROJECT_ID),
        healthy: Boolean(this.environment.firebaseConfigured),
      },
    };
  }
  private validatePolicy(settings: EditableSystemSettings) {
    const providers = this.providerStatus();
    const warnings: { path: string; message: string }[] = [];
    if (settings.notifications.smsEnabled && (!providers.sms.configured || !providers.sms.healthy))
      throw new UnprocessableEntityError(
        'SMS cannot be enabled until its provider is configured and healthy.',
        { 'settings.notifications.smsEnabled': ['SMS provider is unavailable'] },
      );
    if (settings.notifications.emailEnabled && !providers.email.healthy)
      warnings.push({
        path: 'settings.notifications.emailEnabled',
        message: 'Email is enabled, but its provider is not currently available.',
      });
    return warnings;
  }
  private response(record: SettingsRecord) {
    return {
      ...record,
      integrations: { providers: this.providerStatus() },
      environment: {
        deploymentName: this.environment.NODE_ENV,
        applicationVersion: this.environment.APP_VERSION,
        apiBaseUrl: this.environment.PUBLIC_API_BASE_URL,
        firebaseProjectId: this.environment.FIREBASE_PROJECT_ID,
        firebaseStorageBucket: this.environment.FIREBASE_STORAGE_BUCKET ?? null,
      },
    };
  }
  async read() {
    return this.response(await this.repository.get());
  }
  validate(settings: EditableSystemSettings) {
    return { valid: true, warnings: this.validatePolicy(settings), schemaVersion: 1 };
  }
  async update(
    version: number,
    settings: EditableSystemSettings,
    actor: SettingsActor,
    correlationId: string,
  ) {
    const warnings = this.validatePolicy(settings);
    const current = await this.repository.get();
    const changedFields = pathsChanged(current, settings).filter((path) =>
      Object.keys(defaultSystemSettings).some(
        (category) => path === category || path.startsWith(`${category}.`),
      ),
    );
    const categories = Array.from(new Set(changedFields.map((path) => path.split('.')[0])));
    const record = await this.repository.transact(version, settings, actor, {
      category: categories.length === 1 ? categories[0] : 'multiple',
      changedFields,
      result: 'success',
      correlationId,
      action: 'system-settings.update',
    });
    return { data: this.response(record), warnings };
  }
  async reset(
    category: keyof EditableSystemSettings,
    version: number,
    actor: SettingsActor,
    correlationId: string,
  ) {
    const current = await this.repository.get();
    const next = {
      ...current,
      [category]: structuredClone(defaultSystemSettings[category]),
    } as EditableSystemSettings;
    const changedFields = pathsChanged(current[category], next[category], category);
    const record = await this.repository.transact(version, next, actor, {
      category,
      changedFields,
      result: 'success',
      correlationId,
      action: 'system-settings.reset',
    });
    return { data: this.response(record), warnings: this.validatePolicy(next) };
  }
  history(limit: number, cursor?: string) {
    return this.repository.history(limit, cursor);
  }
}
