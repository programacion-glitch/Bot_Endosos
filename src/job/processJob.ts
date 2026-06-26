import { ParsedEmail, ActionResult } from '../types';
import { getNowCertsPage, navigateToClient, invalidateSession } from '../browser/nowcertsLogin';
import { closeBrowser } from '../browser/browserManager';
import { dispatchCommands } from '../actions/dispatcher';
import { sendReviewEmail, sendErrorNotification, sendAlertEmail } from '../email/emailSender';
import { logger, logEmailProcessing } from '../utils/logger';

export interface ProcessOutcome {
  allSucceeded: boolean;
  summary: string;
  files: string[];
  errorMessage?: string;
}

export function buildChangesDescription(results: ActionResult[]): string {
  return results
    .map(r => `${r.success ? '✓' : '✗'} ${r.commandType}: ${r.message}`)
    .join('\n');
}

/**
 * Núcleo de ejecución, independiente de la fuente (IMAP o cola).
 * Abre el navegador, navega al cliente, ejecuta los comandos, manda el review
 * email y notificaciones de error. NO cierra el navegador ni toca la fuente.
 */
export async function processJob(email: ParsedEmail): Promise<ProcessOutcome> {
  logEmailProcessing(email.subject, email.commands.length);

  // 1. Abrir navegador + login (un reintento, igual que main.ts)
  let page;
  try {
    page = await getNowCertsPage();
  } catch (err) {
    const msg = (err as Error).message;
    logger.error(`Failed to open NowCerts browser for "${email.subject}": ${msg}`);
    invalidateSession();
    try { await closeBrowser(); } catch { /* ignore */ }
    try {
      page = await getNowCertsPage();
    } catch (err2) {
      const msg2 = (err2 as Error).message;
      const errorMessage = `No se pudo abrir el navegador de NowCerts tras 2 intentos.\nError 1: ${msg}\nError 2: ${msg2}`;
      await sendErrorNotification({
        emailSubject: email.subject,
        errorMessage,
        clientName: email.clientName,
        usdot: email.usdot,
      });
      return { allSucceeded: false, summary: '', files: [], errorMessage };
    }
  }

  // 2. Navegar al cliente (si no es Create Insured)
  const isCreateInsured = email.commands.some(c => c.type === 'CREATE_INSURED');
  if (!isCreateInsured && email.clientName) {
    const found = await navigateToClient(page, email.clientName, email.usdot);
    if (!found) {
      const errorMessage = `Cliente no encontrado en NowCerts: "${email.clientName}" (USDOT: ${email.usdot ?? 'N/A'})`;
      logger.error(errorMessage);
      await sendAlertEmail({
        to: email.from,
        subject: `[ERROR] Cliente no encontrado: ${email.clientName}`,
        body: errorMessage,
      });
      return { allSucceeded: false, summary: '', files: [], errorMessage };
    }
  }

  // 3. Ejecutar los comandos
  let results: ActionResult[];
  try {
    results = await dispatchCommands(page, email);
  } catch (err) {
    const errorMessage = `Error fatal durante el dispatch: ${(err as Error).message}`;
    logger.error(errorMessage);
    await sendErrorNotification({
      emailSubject: email.subject,
      errorMessage: `${errorMessage}\n\n${(err as Error).stack ?? ''}`,
      clientName: email.clientName,
      usdot: email.usdot,
    });
    invalidateSession();
    return { allSucceeded: false, summary: '', files: [], errorMessage };
  }

  // 4. Recolectar resultados
  const allFiles = results.flatMap(r => r.downloadedFiles ?? []);
  const errorScreenshots = results.map(r => r.errorScreenshot).filter((s): s is string => !!s);
  const failures = results.filter(r => !r.success);
  const summary = buildChangesDescription(results);
  const files = [...allFiles, ...errorScreenshots];

  // 5. Review email (siempre)
  try {
    await sendReviewEmail({
      clientName: email.clientName ?? 'Unknown',
      usdot: email.usdot ?? '',
      changesDescription: summary,
      attachments: files,
    });
  } catch (err) {
    logger.error(`Failed to send review email: ${(err as Error).message}`);
  }

  // 6. Notificación de error si hubo fallos
  if (failures.length > 0) {
    const failSummary = failures.map(f => `${f.commandType}: ${f.message}`).join('\n');
    await sendErrorNotification({
      emailSubject: email.subject,
      errorMessage: `${failures.length} comando(s) fallaron:\n\n${failSummary}`,
      clientName: email.clientName,
      usdot: email.usdot,
      screenshots: errorScreenshots,
    });
    return { allSucceeded: false, summary, files, errorMessage: failSummary };
  }

  return { allSucceeded: true, summary, files };
}
