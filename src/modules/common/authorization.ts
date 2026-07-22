import { ForbiddenError } from './errors.js';

export const requirePermission = (permission: string) => async (req: any) => {
  const permissions = req.user?.permissions ?? [];
  if (!permissions.includes('*') && !permissions.includes(permission))
    throw new ForbiddenError(`Missing permission: ${permission}`);
};
