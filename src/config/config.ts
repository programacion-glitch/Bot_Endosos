import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  imap: {
    host: required('IMAP_HOST'),
    port: parseInt(optional('IMAP_PORT', '993')),
    user: required('IMAP_USER'),
    password: required('IMAP_PASSWORD'),
    mailbox: optional('IMAP_MAILBOX', 'INBOX'),
    pollIntervalMs: parseInt(optional('IMAP_POLL_INTERVAL_MS', '30000')),
    tls: true,
  },

  smtp: {
    host: required('SMTP_HOST'),
    port: parseInt(optional('SMTP_PORT', '587')),
    user: required('SMTP_USER'),
    password: required('SMTP_PASSWORD'),
    from: optional('SMTP_FROM', `"H2O Bot" <${process.env.SMTP_USER}>`),
  },

  nowcerts: {
    url: optional('NOWCERTS_URL', 'https://www8.nowcerts.com/'),
    loginUrl: optional(
      'NOWCERTS_LOGIN_URL',
      'https://identity.nowcerts.com/Account/Login?ReturnUrl=%2FAccount%2FLoginRedirectUrl'
    ),
    user: required('NOWCERTS_USER'),
    password: required('NOWCERTS_PASSWORD'),
    authorizedRep: optional('NOWCERTS_AUTHORIZED_REP', 'Jenny Firma Definitiva'),
  },

  review: {
    email: required('REVIEW_EMAIL'),
  },

  errorNotify: {
    email: optional('ERROR_NOTIFY_EMAIL', ''),
  },

  files: {
    agentsExcelPath: path.resolve(optional('AGENTS_EXCEL_PATH', './data/agents.xlsx')),
    downloadsPath: path.resolve(optional('DOWNLOADS_PATH', './downloads')),
    logsPath: path.resolve('./logs'),
  },

  playwright: {
    headless: optional('HEADLESS', 'false') === 'true',
    slowMo: parseInt(optional('BROWSER_SLOW_MO', '100')),
  },

  retry: {
    maxRetries: parseInt(optional('MAX_RETRIES', '3')),
    delayMs: parseInt(optional('RETRY_DELAY_MS', '5000')),
  },
} as const;
