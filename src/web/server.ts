import 'dotenv/config';
import path from 'path';
import { createApp } from './app';
import { openJobStore } from '../job/jobStore';
import { openUserStore } from './userStore';
import { config } from '../config/config';
import { logger } from '../utils/logger';

const jobStore = openJobStore(config.jobs.dbPath);
const userStore = openUserStore(config.web.usersDbPath);
const uiDistDir = path.resolve(__dirname, '../../web/ui/dist');

const app = createApp({
  jobStore,
  userStore,
  sessionSecret: config.web.sessionSecret,
  downloadsDir: config.files.downloadsPath,
  uiDistDir,
});

app.listen(config.web.port, () => {
  logger.info(`Portal web escuchando en http://localhost:${config.web.port}`);
  if (config.web.sessionSecret === 'dev-insecure-secret-change-me') {
    logger.warn('SESSION_SECRET por defecto — define uno propio en .env para producción.');
  }
});
