import crypto from 'node:crypto';
import type { Storage } from 'firebase-admin/storage';
import { AppError, NotFoundError, ValidationAppError } from '../common/errors.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { AppUser } from '../users/users.types.js';
import type { ProfileUpdateInput } from './profile.schemas.js';

const deviceToContract: Record<string, 'LaptopDesktop' | 'Tablet' | 'Phone'> = {
  laptop: 'LaptopDesktop',
  desktop: 'LaptopDesktop',
  LaptopDesktop: 'LaptopDesktop',
  tablet: 'Tablet',
  Tablet: 'Tablet',
  phone: 'Phone',
  Phone: 'Phone',
};
const deviceToUser: Record<string, AppUser['primaryStudyDevice']> = {
  LaptopDesktop: 'laptop',
  Tablet: 'tablet',
  Phone: 'phone',
};
const allowedMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Profile image must be 5 MB or smaller.') {
    super(413, 'Payload Too Large', message, 'payload_too_large');
  }
}

export class ProfileService {
  constructor(
    private users: UsersRepository,
    private storage?: Storage,
    private storageBucket?: string,
  ) {}

  async getProfile(userId: string) {
    const user = await this.users.get(userId);
    if (!user) throw new NotFoundError('Profile was not found.');
    return this.toProfile(user);
  }

  async updateProfile(userId: string, input: ProfileUpdateInput) {
    const existing = await this.users.get(userId);
    if (!existing) throw new NotFoundError('Profile was not found.');
    const updated = await this.users.upsert({
      ...existing,
      displayName: input.displayName.trim(),
      timeZone: input.timeZone.trim(),
      preferredStudyTime: input.preferredStudyTime ?? null,
      primaryStudyDevice: input.primaryDevice ? deviceToUser[input.primaryDevice] : null,
    } as any);
    return this.toProfile(updated);
  }

  async updateImage(userId: string, file: { buffer: Buffer; mimeType: string; filename?: string }) {
    if (!allowedMimeTypes.has(file.mimeType))
      throw new ValidationAppError({ image: ['Image must be a PNG, JPEG, or WebP file.'] });
    if (file.buffer.length > 5 * 1024 * 1024) throw new PayloadTooLargeError();
    const existing = await this.users.get(userId);
    if (!existing) throw new NotFoundError('Profile was not found.');
    const cacheKey = crypto.randomUUID();
    const objectName = `profiles/${userId}/${cacheKey}.${extensions[file.mimeType]}`;
    let avatarUrl = `/profiles/${userId}/${cacheKey}.${extensions[file.mimeType]}`;
    if (this.storage && this.storageBucket) {
      await this.storage
        .bucket(this.storageBucket)
        .file(objectName)
        .save(file.buffer, {
          metadata: { contentType: file.mimeType, cacheControl: 'public, max-age=31536000' },
          resumable: false,
        });
      avatarUrl = `https://storage.googleapis.com/${this.storageBucket}/${objectName}`;
    }
    const updated = await this.users.upsert({ ...existing, photoUrl: avatarUrl } as any);
    return this.toProfile(updated);
  }

  private toProfile(user: AppUser & Record<string, any>) {
    return {
      userId: user.uid,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.photoUrl ?? null,
      firebaseProvider: user.authProvider ?? 'firebase',
      scholarRole: user.roles?.[0] ?? 'Scholar',
      activeCohort: user.activeCohort ?? user.activeCohortName ?? user.activeCohortId ?? null,
      enrollmentDate: user.enrollmentDate
        ? new Date(user.enrollmentDate).toISOString()
        : user.enrollmentDateUtc
          ? new Date(user.enrollmentDateUtc).toISOString()
          : null,
      timeZone: user.timeZone ?? 'UTC',
      preferredStudyTime: user.preferredStudyTime ?? null,
      primaryDevice: user.primaryStudyDevice
        ? (deviceToContract[user.primaryStudyDevice] ?? null)
        : null,
    };
  }
}
