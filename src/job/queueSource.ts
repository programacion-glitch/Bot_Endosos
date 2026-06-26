import { JobStore } from './jobStore';
import { Job } from '../shared/jobTypes';
import { ParsedEmail } from '../types';
import { processJob as defaultProcessJob } from './processJob';
import { logger } from '../utils/logger';

/** Convierte un Job de la cola al ParsedEmail que consume processJob/dispatcher. */
export function jobToParsedEmail(job: Job): ParsedEmail {
  return {
    uid: 0,
    subject: `[PORTAL] ${job.clientName}${job.usdot ? ` // USDOT ${job.usdot}` : ''}`,
    from: job.notifyTo,
    to: job.notifyTo,
    body: '',
    clientName: job.clientName,
    usdot: job.usdot,
    dba: job.dba,
    commands: job.commands,
    language: job.language,
  };
}

/**
 * Toma el siguiente job en cola y lo procesa. Devuelve true si procesó uno,
 * false si la cola estaba vacía. El navegador lo cierra el llamador.
 */
export async function processOneQueuedJob(
  store: JobStore,
  deps: { processJob: typeof defaultProcessJob } = { processJob: defaultProcessJob }
): Promise<boolean> {
  const job = store.claimNextQueued();
  if (!job) return false;

  logger.info(`Procesando job de la cola: ${job.id} (${job.clientName})`);
  try {
    const outcome = await deps.processJob(jobToParsedEmail(job));
    if (outcome.allSucceeded) {
      store.completeJob(job.id, outcome.summary, outcome.files);
      logger.info(`Job ${job.id} completado.`);
    } else {
      store.failJob(job.id, outcome.errorMessage ?? 'Falló sin mensaje', outcome.summary, outcome.files);
      logger.warn(`Job ${job.id} falló: ${outcome.errorMessage}`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    store.failJob(job.id, msg, '', []);
    logger.error(`Job ${job.id} lanzó excepción: ${msg}`);
  }
  return true;
}
