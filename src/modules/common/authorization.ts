import { ForbiddenError } from './errors.js';
export const requirePermission = (permission: string) => async (req: any) => {
  if (!req.user?.permissions?.includes(permission))
    throw new ForbiddenError(`Missing permission: ${permission}`);
};
