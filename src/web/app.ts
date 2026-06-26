import express from 'express';
import path from 'path';
import fs from 'fs';
import { JobStore } from '../job/jobStore';
import { UserStore } from './userStore';
import { sessionMiddleware, createAuthRouter } from './auth';
import { createJobsRouter } from './jobsRouter';

export interface AppDeps {
  jobStore: JobStore;
  userStore: UserStore;
  sessionSecret: string;
  downloadsDir: string;
  uiDistDir?: string;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware(deps.sessionSecret));

  app.use('/api', createAuthRouter(deps.userStore));
  app.use('/api/jobs', createJobsRouter(deps.jobStore, deps.downloadsDir));

  // Servir la UI compilada (si existe) con fallback SPA
  if (deps.uiDistDir && fs.existsSync(deps.uiDistDir)) {
    app.use(express.static(deps.uiDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(deps.uiDistDir!, 'index.html'));
    });
  }

  return app;
}
