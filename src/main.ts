import 'dotenv/config';
import { fetchUnseenEmails, markAsSeen, moveToFolder, ensureMailbox, closeImap, RawEmail } from './email/imapClient';
import { parseEmail } from './email/emailParser';
import { closeBrowser } from './browser/browserManager';
import { invalidateSession } from './browser/nowcertsLogin';
import { processJob } from './job/processJob';
import { openJobStore } from './job/jobStore';
import { processOneQueuedJob } from './job/queueSource';
import { config } from './config/config';
import { sleep } from './utils/retry';
import { logger } from './utils/logger';
import { Command } from './types';

const PROCESSED_FOLDER = 'H2O-Endosos';

type SubjectPrefix = 'BOT-END' | 'BOT-DOCUMENTAR';

function getSubjectPrefix(subject: string): SubjectPrefix | null {
  const upper = subject.toUpperCase().trim();
  if (upper.startsWith('BOT-DOCUMENTAR')) return 'BOT-DOCUMENTAR';
  if (upper.startsWith('BOT-END') || upper.startsWith('END-BOT')) return 'BOT-END';
  return null;
}

function validateCoherence(prefix: SubjectPrefix, commands: Command[]): { valid: boolean; reason?: string } {
  const hasCreateInsured = commands.some(c => c.type === 'CREATE_INSURED');
  if (prefix === 'BOT-DOCUMENTAR' && !hasCreateInsured) {
    return { valid: false, reason: 'Subject says BOT-DOCUMENTAR but no CREATE_INSURED command found in body' };
  }
  if (prefix === 'BOT-END' && hasCreateInsured) {
    return { valid: false, reason: 'Subject says BOT-END (existing client) but body contains CREATE_INSURED command' };
  }
  return { valid: true };
}

/** Procesa un correo IMAP: valida, ejecuta vía processJob y hace bookkeeping IMAP. */
async function processEmail(raw: RawEmail): Promise<void> {
  const prefix = getSubjectPrefix(raw.subject);
  if (!prefix) {
    logger.warn(`Email subject doesn't match valid prefixes: "${raw.subject}" — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  const email = parseEmail(raw);

  if (email.commands.length === 0) {
    logger.warn(`No commands found in email: "${email.subject}" — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  const coherence = validateCoherence(prefix, email.commands);
  if (!coherence.valid) {
    logger.warn(`Coherence validation failed for "${email.subject}": ${coherence.reason} — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  const outcome = await processJob(email);

  if (outcome.allSucceeded) {
    await moveToFolder(raw.uid, PROCESSED_FOLDER);
  } else {
    await markAsSeen(raw.uid);
  }
  logger.info(`Email processed (success=${outcome.allSucceeded}). Subject: "${email.subject}"`);
}

/** Cierra el navegador entre jobs para no dejar sesiones abiertas. */
async function closeBrowserSafe(): Promise<void> {
  try {
    await closeBrowser();
    invalidateSession();
    logger.info('Browser closed after job.');
  } catch (err) {
    logger.warn(`Could not close browser cleanly: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  logger.info('=== H2O Bot starting ===');

  const store = openJobStore(config.jobs.dbPath);
  // Jobs que quedaron 'processing' por un reinicio: marcarlos para revisión (no se reintentan solos).
  const stuck = store.markStuckProcessingAsNeedsReview();
  if (stuck > 0) logger.warn(`${stuck} job(s) quedaron en 'processing' tras un reinicio — marcados como 'needs_review'.`);

  const shutdown = async () => {
    logger.info('Shutting down...');
    await closeImap();
    await closeBrowser();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await ensureMailbox(PROCESSED_FOLDER);
    logger.info(`Mailbox "${PROCESSED_FOLDER}" ready.`);
  } catch (err) {
    logger.warn(`Could not verify mailbox "${PROCESSED_FOLDER}": ${(err as Error).message}`);
  }

  logger.info('Bot ready. Worker único: drena la cola y luego IMAP, un job a la vez.');

  // Worker unificado: un solo job a la vez (cola primero, luego IMAP).
  while (true) {
    try {
      // 1. Drenar la cola del portal (un job a la vez)
      let didQueueJob = false;
      let draining = true;
      while (draining) {
        try {
          const processed = await processOneQueuedJob(store);
          if (!processed) {
            draining = false; // cola vacía: nada que cerrar
          } else {
            didQueueJob = true;
            await closeBrowserSafe(); // cerrar tras cada job procesado
          }
        } catch (err) {
          logger.error(`Error inesperado procesando la cola: ${(err as Error).message}`);
          await closeBrowserSafe(); // se reclamó un job y el navegador puede haber quedado abierto
          draining = false; // evita hot-loop si el store falla de forma persistente; reintenta el próximo ciclo
        }
      }

      // 2. Procesar correos IMAP (respaldo)
      const emails = await fetchUnseenEmails().catch(err => {
        logger.error(`IMAP fetch error: ${(err as Error).message}`);
        return [] as RawEmail[];
      });
      for (const email of emails) {
        try {
          await processEmail(email);
        } catch (err) {
          logger.error(`Unhandled error processing email "${email.subject}": ${(err as Error).message}`);
        } finally {
          await closeBrowserSafe();
        }
      }

      // 3. Esperar antes del siguiente ciclo solo si no hubo trabajo de cola
      if (!didQueueJob) {
        await sleep(config.queue.pollIntervalMs);
      }
    } catch (err) {
      logger.error(`Worker loop error: ${(err as Error).message}`);
      await sleep(config.queue.pollIntervalMs);
    }
  }
}

main().catch(err => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
