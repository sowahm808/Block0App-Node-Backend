import type { AppRole } from '../common/roles-permissions.js';

export type Permission = string;
export type AppUserStatus = 'Active' | 'Suspended' | 'Disabled' | 'Deleted';

export interface AppUser {
  uid: string;
  email: string;
  emailNormalized?: string | null;
  displayName: string;
  photoUrl?: string | null;
  authProvider?: string;
  country?: string | null;
  timeZone?: string | null;
  primaryStudyDevice?: 'phone' | 'tablet' | 'laptop' | 'desktop' | null;
  acceptedTerms?: boolean;
  acceptedTermsAt?: Date | null;
  acceptedTermsVersion?: string | null;
  acceptedPrivacyPolicy?: boolean;
  acceptedPrivacyPolicyAt?: Date | null;
  acceptedPrivacyPolicyVersion?: string | null;
  emailVerified: boolean;
  status?: AppUserStatus;
  roles?: AppRole[];
  permissions: Permission[];
  cohortIds?: string[];
  activeCohortId?: string | null;
  mfaEnabled: boolean;
  administrativeMfaRequired: boolean;
  createdUtc: Date;
  updatedUtc: Date;
  lastLoginAt?: Date;
}

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  roles: AppRole[];
  permissions: string[];
  cohortIds: string[];
  activeCohortId?: string;
}
