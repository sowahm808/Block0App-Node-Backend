export const appRoles = [
  'Scholar',
  'Mentor',
  'ContentReviewer',
  'Administrator',
  'SuperAdministrator',
] as const;

export type AppRole = (typeof appRoles)[number];

export const rolePermissions: Record<AppRole, string[]> = {
  Scholar: [
    'dashboard.read',
    'challenge.read',
    'learning.study',
    'scenario.study',
    'rehearsal.study',
    'checkin.create',
    'team.read',
    'team.accountability.create',
    'readiness.read',
    'rewards.read',
    'certificate.read',
    'notification.read',
    'profile.manage',
  ],
  Mentor: [
    'dashboard.read',
    'mentor.teams.read',
    'mentor.progress.read',
    'mentor.support.read',
    'mentor.support.manage',
    'notification.read',
    'profile.manage',
  ],
  ContentReviewer: [
    'dashboard.read',
    'content.read',
    'content.review',
    'content.requestChanges',
    'content.approve',
    'notification.read',
    'profile.manage',
  ],
  Administrator: [
    'dashboard.read',
    'users.read',
    'users.manage',
    'challenges.manage',
    'cohorts.manage',
    'teams.manage',
    'content.manage',
    'content.review',
    'content.approve',
    'content.publish',
    'reports.read',
    'readiness.manage',
    'rewards.manage',
    'raffles.manage',
    'certificates.manage',
    'audit.read',
    'notification.manage',
    'admin.announcements.manage',
    'admin.enrollments.manage',
    'admin.rewards.manage',
    'admin.certificates.manage',
    'admin.ai.manage',
    'admin.system.read',
    'admin.flags.manage',
    'profile.manage',
  ],
  SuperAdministrator: ['*'],
};

export function resolvePermissions(roles: AppRole[] = [], explicitPermissions: string[] = []) {
  if (roles.includes('SuperAdministrator')) return ['*'];
  return Array.from(
    new Set([...roles.flatMap((role) => rolePermissions[role] ?? []), ...explicitPermissions]),
  );
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (appRoles as readonly string[]).includes(value);
}
