import { z } from 'zod';

export const preferredStudyTimes = [
  'EarlyMorning',
  'Morning',
  'Afternoon',
  'Evening',
  'LateNight',
] as const;
export const primaryDevices = ['LaptopDesktop', 'Tablet', 'Phone'] as const;

const validTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    timeZone: z.string().trim().min(1).refine(validTimeZone, 'Invalid IANA time zone.'),
    preferredStudyTime: z.enum(preferredStudyTimes).nullable().optional(),
    primaryDevice: z.enum(primaryDevices).nullable().optional(),
  })
  .strict();

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
