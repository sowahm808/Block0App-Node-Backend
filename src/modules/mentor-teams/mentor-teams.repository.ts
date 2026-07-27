import type { Firestore } from 'firebase-admin/firestore';
import type { AuthenticatedPrincipal } from '../auth/auth.types.js';
import type { ListMentorTeamsInput } from './mentor-teams.schemas.js';

const IN_LIMIT = 30;
const chunks = <T>(values: T[]) =>
  Array.from({ length: Math.ceil(values.length / IN_LIMIT) }, (_, index) =>
    values.slice(index * IN_LIMIT, (index + 1) * IN_LIMIT),
  );

const hasGlobalScope = (principal: AuthenticatedPrincipal) =>
  principal.permissions.includes('*') || principal.permissions.includes('mentor.teams.all');

const belongsToTenant = (data: Record<string, any>, principal: AuthenticatedPrincipal) => {
  const tenant = principal.tenantId ?? principal.organizationId;
  if (!tenant) return true;
  return (data.tenantId ?? data.organizationId) === tenant;
};

const nonNegativeInteger = (value: unknown) =>
  Math.max(0, Number.isInteger(Number(value)) ? Number(value) : 0);

export class MentorTeamsRepository {
  constructor(private readonly db: Firestore) {}

  private async authorizedTeamIds(principal: AuthenticatedPrincipal): Promise<string[] | null> {
    if (hasGlobalScope(principal)) return null;
    const snapshot = await this.db
      .collection('mentorTeamAssignments')
      .where('mentorId', '==', principal.uid)
      .get();
    return Array.from(
      new Set(
        snapshot.docs
          .filter((doc) => {
            const data = doc.data();
            return data.active !== false && belongsToTenant(data, principal);
          })
          .map((doc) => String(doc.data().teamId ?? ''))
          .filter(Boolean),
      ),
    );
  }

  private summary(doc: any) {
    const data = doc.data();
    const result: Record<string, unknown> = {
      id: doc.id,
      name: String(data.name ?? '').trim(),
      status: data.status,
      memberCount: nonNegativeInteger(data.memberCount),
      needsAttentionCount: nonNegativeInteger(data.needsAttentionCount),
    };
    if (data.description) result.description = String(data.description).slice(0, 280);
    if (data.challengeId && data.challengeName) {
      result.challengeId = String(data.challengeId);
      result.challengeName = String(data.challengeName);
    }
    return result;
  }

  private async fetchTeams(ids: string[] | null, principal: AuthenticatedPrincipal) {
    if (ids?.length === 0) return [];
    const snapshots = ids
      ? await Promise.all(
          chunks(ids).map((batch) =>
            this.db.collection('mentorTeams').where('__name__', 'in', batch).get(),
          ),
        )
      : [await this.db.collection('mentorTeams').get()];
    return snapshots
      .flatMap((snapshot) => snapshot.docs)
      .filter((doc) => belongsToTenant(doc.data(), principal));
  }

  async list(principal: AuthenticatedPrincipal, input: ListMentorTeamsInput) {
    const ids = await this.authorizedTeamIds(principal);
    const query = input.q?.toLocaleLowerCase();
    const rows = (await this.fetchTeams(ids, principal))
      .filter((doc) => !input.status || doc.data().status === input.status)
      .filter(
        (doc) =>
          !query ||
          String(doc.data().name ?? '')
            .toLocaleLowerCase()
            .includes(query),
      )
      .sort((left, right) => {
        const byName = String(left.data().name ?? '').localeCompare(
          String(right.data().name ?? ''),
          undefined,
          { sensitivity: 'base' },
        );
        return byName || left.id.localeCompare(right.id);
      });
    const offset = (input.page - 1) * input.pageSize;
    return {
      items: rows.slice(offset, offset + input.pageSize).map((doc) => this.summary(doc)),
      page: input.page,
      pageSize: input.pageSize,
      total: rows.length,
    };
  }

  async detail(principal: AuthenticatedPrincipal, teamId: string) {
    const ids = await this.authorizedTeamIds(principal);
    if (ids && !ids.includes(teamId)) return null;
    const team = await this.db.collection('mentorTeams').doc(teamId).get();
    if (!team.exists || !belongsToTenant(team.data()!, principal)) return null;
    const members = await this.db
      .collection('teamMemberships')
      .where('teamId', '==', teamId)
      .where('status', '==', 'active')
      .get();
    return {
      ...this.summary(team),
      members: members.docs.map((doc) => {
        const data = doc.data();
        const member: Record<string, unknown> = {
          id: String(data.scholarId ?? data.memberId ?? doc.id),
          displayName: String(data.displayName ?? '').trim(),
          progress: Math.min(100, nonNegativeInteger(data.progress)),
          lastActivityAt: data.lastActivityAt,
        };
        if (data.attentionReason) member.attentionReason = String(data.attentionReason);
        return member;
      }),
    };
  }
}
