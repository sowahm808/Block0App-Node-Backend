import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../common/auth-middleware.js';
import { ForbiddenError } from '../common/errors.js';
import type { AuthService } from '../auth/auth.service.js';
import {
  parseReportQuery,
  reportCategories,
  type ReportCategory,
  type ReportQuery,
} from './reports.schemas.js';

export interface ReportsDataSource {
  overview(query: ReportQuery): Promise<unknown>;
  list(category: ReportCategory, query: ReportQuery): Promise<unknown>;
}

const permissions: Record<ReportCategory, string> = {
  scholars: 'reports.scholar.read',
  cohorts: 'reports.cohort.read',
  challenges: 'reports.challenge.read',
  'learning-packs': 'reports.learning-pack.read',
  questions: 'reports.question.read',
};

export async function reportsRoutes(
  app: FastifyInstance,
  opts: { reports: ReportsDataSource; authService: AuthService },
) {
  const authorize = (permission: string) => async (request: FastifyRequest) => {
    await authenticate(opts.authService)(request);
    const granted = request.user?.permissions ?? [];
    if (!granted.includes('*') && !granted.includes(permission)) {
      throw new ForbiddenError(`Missing permission: ${permission}`);
    }
  };

  app.get('/admin/reports/overview', { preHandler: authorize('reports.read') }, async (request) => {
    const query = parseReportQuery(request.query, 'scholars');
    return opts.reports.overview(query);
  });

  for (const category of reportCategories) {
    app.get(
      `/admin/reports/${category}`,
      { preHandler: authorize(permissions[category]) },
      async (request) => {
        const query = parseReportQuery(request.query, category);
        return opts.reports.list(category, query);
      },
    );
  }
}
