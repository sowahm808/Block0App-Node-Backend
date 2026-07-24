import type { AccountSupportRequestInput, SettingsInput } from './settings.schemas.js';
import { settingsSchema } from './settings.schemas.js';
import type { SettingsRepository } from './settings.repository.js';

export const dataUseSummary =
  'Block Zero uses profile, study activity, readiness, reward, and support data to personalize learning, operate cohorts, issue certificates, and improve support workflows.';

export class SettingsService {
  constructor(private settings: SettingsRepository) {}

  async getSettings(userId: string) {
    const record = await this.settings.getSettings(userId);
    return this.toResponse(settingsSchema.parse(record ?? {}), record?.updatedAtUtc);
  }

  async updateSettings(userId: string, input: SettingsInput) {
    const saved = await this.settings.saveSettings(userId, settingsSchema.parse(input));
    return this.toResponse(saved, saved.updatedAtUtc);
  }

  getDataUseSummary() {
    return { summary: dataUseSummary, updatedAt: '2026-07-24T00:00:00Z' };
  }

  async createAccountSupportRequest(userId: string, input: AccountSupportRequestInput) {
    const request = await this.settings.createAccountSupportRequest(userId, {
      ...input,
      message: input.message.replace(/[<>]/g, ''),
    });
    return { requestId: request.id, status: request.status, createdAt: request.createdAt };
  }

  private toResponse(settings: SettingsInput, updatedAt?: string) {
    return {
      ...settings,
      privacy: {
        dataUseSummary:
          'Block Zero uses profile, study activity, readiness, reward, and support data to personalize learning and operate cohorts.',
        supportsDataExportRequests: false,
      },
      capabilities: {
        canRequestDataExport: false,
        canCreateAccountSupportRequest: true,
      },
      updatedAt: updatedAt ?? '2026-07-24T00:00:00Z',
    };
  }
}
