import { describe, it, expect } from 'vitest';
import { buildConfig } from './config';

// Env mínimo que deja pasar los required que SÍ se mantienen (SMTP + review + nowcerts).
// A propósito SIN credenciales IMAP: el bot debe arrancar sin ellas cuando la ingesta
// por correo está apagada.
const baseEnv = (): NodeJS.ProcessEnv => ({
  SMTP_HOST: 'smtp.test', SMTP_USER: 'u', SMTP_PASSWORD: 'p',
  REVIEW_EMAIL: 'review@h2oins.com',
  NOWCERTS_USER: 'nu', NOWCERTS_PASSWORD: 'np',
});

describe('buildConfig', () => {
  it('arranca sin credenciales IMAP (no truena) y deja imap vacío', () => {
    const cfg = buildConfig(baseEnv());
    expect(cfg.imap.host).toBe('');
    expect(cfg.imap.user).toBe('');
    expect(cfg.imap.password).toBe('');
  });

  it('email.ingest es false por defecto (solo cola)', () => {
    expect(buildConfig(baseEnv()).email.ingest).toBe(false);
  });

  it('email.ingest es true con INGEST_EMAIL=true', () => {
    expect(buildConfig({ ...baseEnv(), INGEST_EMAIL: 'true' }).email.ingest).toBe(true);
  });

  it('los correos de resultado siguen siendo obligatorios: sin SMTP_HOST truena', () => {
    const env = baseEnv();
    delete env.SMTP_HOST;
    expect(() => buildConfig(env)).toThrow(/SMTP_HOST/);
  });

  it('sin REVIEW_EMAIL truena (se mantienen las notificaciones de revisión)', () => {
    const env = baseEnv();
    delete env.REVIEW_EMAIL;
    expect(() => buildConfig(env)).toThrow(/REVIEW_EMAIL/);
  });
});
