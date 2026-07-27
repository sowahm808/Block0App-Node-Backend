import { z } from 'zod';

export const mentorTeamStatuses = ['active', 'paused', 'archived'] as const;

export const listMentorTeamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(mentorTeamStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export const mentorTeamParamsSchema = z.object({
  teamId: z.string().trim().min(1).max(200),
});

export type ListMentorTeamsInput = z.infer<typeof listMentorTeamsSchema>;
