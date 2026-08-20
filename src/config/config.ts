import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optional(env: NodeJS.ProcessEnv, key: string, defaultValue: string): string {
  return env[key] ?? defaultValue;
}

/**
 * Construye la config desde un env explícito (testeable sin depender de process.env).
 * IMAP es OPCIONAL a propósito: el bot ingiere trabajo desde la cola del portal y solo
 * lee el buzón si INGEST_EMAIL=true. Como required() truena al cargar el módulo, dejar
 * IMAP como required obligaría a tener credenciales aunque la ingesta por correo esté
 * apagada. SMTP y REVIEW_EMAIL SÍ siguen requeridos: se mantienen los correos de resultado.
 */
export function buildConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    // Ingesta por correo (IMAP). Por defecto APAGADA: el bot solo consume la cola del portal.
    email: {
      ingest: optional(env, 'INGEST_EMAIL', 'false') === 'true',
    },

    imap: {
      host: optional(env, 'IMAP_HOST', ''),
      port: parseInt(optional(env, 'IMAP_PORT', '993')),
      user: optional(env, 'IMAP_USER', ''),
      password: optional(env, 'IMAP_PASSWORD', ''),
      mailbox: optional(env, 'IMAP_MAILBOX', 'INBOX'),
      tls: true,
    },

    smtp: {
      host: required(env, 'SMTP_HOST'),
      port: parseInt(optional(env, 'SMTP_PORT', '587')),
      user: required(env, 'SMTP_USER'),
      password: required(env, 'SMTP_PASSWORD'),
      from: optional(env, 'SMTP_FROM', `"H2O Bot" <${env.SMTP_USER}>`),
    },

    nowcerts: {
      url: optional(env, 'NOWCERTS_URL', 'https://www8.nowcerts.com/'),
      loginUrl: optional(
        env,
        'NOWCERTS_LOGIN_URL',
        'https://identity.nowcerts.com/Account/Login?ReturnUrl=%2FAccount%2FLoginRedirectUrl'
      ),
      user: required(env, 'NOWCERTS_USER'),
      password: required(env, 'NOWCERTS_PASSWORD'),
      authorizedRep: optional(env, 'NOWCERTS_AUTHORIZED_REP', 'Jenny Firma Definitiva'),
    },

    review: {
      email: required(env, 'REVIEW_EMAIL'),
    },

    errorNotify: {
      email: optional(env, 'ERROR_NOTIFY_EMAIL', ''),
    },

    files: {
      agentsExcelPath: path.resolve(optional(env, 'AGENTS_EXCEL_PATH', './data/agents.xlsx')),
      downloadsPath: path.resolve(optional(env, 'DOWNLOADS_PATH', './downloads')),
      logsPath: path.resolve('./logs'),
    },

    jobs: {
      dbPath: path.resolve(optional(env, 'JOBS_DB_PATH', './data/jobs.db')),
    },

    queue: {
      pollIntervalMs: parseInt(optional(env, 'QUEUE_POLL_INTERVAL_MS', '5000')),
    },

    web: {
      port: parseInt(optional(env, 'WEB_PORT', '4000')),
      sessionSecret: optional(env, 'SESSION_SECRET', 'dev-insecure-secret-change-me'),
      usersDbPath: path.resolve(optional(env, 'USERS_DB_PATH', './data/users.db')),
    },

    playwright: {
      headless: optional(env, 'HEADLESS', 'false') === 'true',
      slowMo: parseInt(optional(env, 'BROWSER_SLOW_MO', '100')),
    },

    retry: {
      maxRetries: parseInt(optional(env, 'MAX_RETRIES', '3')),
      delayMs: parseInt(optional(env, 'RETRY_DELAY_MS', '5000')),
    },
  } as const;
}

export const config = buildConfig(process.env);
