export type Permission = 'scholar:access' | 'admin:access' | string;
export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  administrativeMfaRequired: boolean;
  permissions: Permission[];
  createdUtc: Date;
  updatedUtc: Date;
}
