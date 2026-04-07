import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { RawEmail } from './email/imapClient';
import { parseEmail } from './email/emailParser';
import { dispatchCommands } from './actions/dispatcher';
import { getNowCertsPage, navigateToClient, invalidateSession } from './browser/nowcertsLogin';
import { closeBrowser } from './browser/browserManager';
import { sendReviewEmail, sendErrorNotification } from './email/emailSender';
import { logger, logEmailProcessing } from './utils/logger';
import { ActionResult, Command } from './types';

// ─── Subject prefix validation (same as main.ts) ────────────────────────────

type SubjectPrefix = 'BOT-END' | 'BOT-DOCUMENTAR';

function getSubjectPrefix(subject: string): SubjectPrefix | null {
  const upper = subject.toUpperCase().trim();
  if (upper.startsWith('BOT-DOCUMENTAR')) return 'BOT-DOCUMENTAR';
  if (upper.startsWith('BOT-END') || upper.startsWith('END-BOT')) return 'BOT-END';
  return null;
}

function validateCoherence(
  prefix: SubjectPrefix,
  commands: Command[],
): { valid: boolean; reason?: string } {
  const hasCreateInsured = commands.some(c => c.type === 'CREATE_INSURED');

  if (prefix === 'BOT-DOCUMENTAR' && !hasCreateInsured) {
    return { valid: false, reason: 'Subject says BOT-DOCUMENTAR but no CREATE_INSURED command found in body' };
  }
  if (prefix === 'BOT-END' && hasCreateInsured) {
    return { valid: false, reason: 'Subject says BOT-END (existing client) but body contains CREATE_INSURED command' };
  }
  return { valid: true };
}

function buildChangesDescription(results: ActionResult[]): string {
  return results
    .map(r => {
      const status = r.success ? '✓' : '✗';
      return `${status} ${r.commandType}: ${r.message}`;
    })
    .join('\n');
}

// ─── Main manual processing ──────────────────────────────────────────────────

async function processManualEmail(raw: RawEmail): Promise<void> {
  const prefix = getSubjectPrefix(raw.subject);
  if (!prefix) {
    logger.error(`Invalid subject prefix: "${raw.subject}"`);
    return;
  }

  const email = parseEmail(raw);

  if (email.commands.length === 0) {
    logger.error(`No commands found in email body.`);
    return;
  }

  const coherence = validateCoherence(prefix, email.commands);
  if (!coherence.valid) {
    logger.error(`Coherence failed: ${coherence.reason}`);
    return;
  }

  logEmailProcessing(email.subject, email.commands.length);
  logger.info(`Parsed commands: ${email.commands.map(c => c.type).join(', ')}`);

  let page = await getNowCertsPage();

  // Navigate to client
  const isCreateInsured = email.commands.some(c => c.type === 'CREATE_INSURED');
  if (!isCreateInsured && email.clientName) {
    const found = await navigateToClient(page, email.clientName, email.usdot);
    if (!found) {
      logger.error(`Client not found: "${email.clientName}" (USDOT: ${email.usdot ?? 'N/A'})`);
      return;
    }
  }

  // Execute commands
  let results: ActionResult[];
  try {
    results = await dispatchCommands(page, email);
  } catch (err) {
    logger.error(`Fatal error during dispatch: ${(err as Error).message}`);
    await sendErrorNotification({
      emailSubject: email.subject,
      errorMessage: `Fatal error: ${(err as Error).message}\n\n${(err as Error).stack ?? ''}`,
      clientName: email.clientName,
      usdot: email.usdot,
    });
    invalidateSession();
    return;
  }

  const allFiles = results.flatMap(r => r.downloadedFiles ?? []);
  const errorScreenshots = results.map(r => r.errorScreenshot).filter((s): s is string => !!s);
  const failures = results.filter(r => !r.success);
  const successes = results.filter(r => r.success);
  const changesDescription = buildChangesDescription(results);

  // Always send review email with results summary (and attachments if any)
  try {
    await sendReviewEmail({
      clientName: email.clientName ?? 'Unknown',
      usdot: email.usdot ?? '',
      changesDescription,
      attachments: [...allFiles, ...errorScreenshots],
    });
  } catch (err) {
    logger.error(`Failed to send review email: ${(err as Error).message}`);
  }

  logger.info(`\n${'='.repeat(60)}`);
  logger.info(`RESULTS: ${successes.length} ok, ${failures.length} failed`);
  logger.info(`${'='.repeat(60)}`);
  logger.info(changesDescription);

  if (failures.length > 0) {
    const failureDetails = failures.map(f => `  ${f.commandType}: ${f.message}`).join('\n');
    logger.error(`Failures:\n${failureDetails}`);
    await sendErrorNotification({
      emailSubject: email.subject,
      errorMessage: `${failures.length} command(s) failed:\n\n${failureDetails}`,
      clientName: email.clientName,
      usdot: email.usdot,
      screenshots: errorScreenshots,
    });
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const jsonFile = process.argv[2];
  if (!jsonFile) {
    console.error('Usage: npx ts-node src/runManual.ts <path-to-manual-email.json>');
    process.exit(1);
  }

  const filePath = path.resolve(jsonFile);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw: RawEmail = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  raw.date = new Date(raw.date);

  logger.info(`=== Manual run: ${filePath} ===`);
  logger.info(`Subject: ${raw.subject}`);
  logger.info(`Body:\n${raw.body}`);

  try {
    await processManualEmail(raw);
  } finally {
    await closeBrowser();
  }
}

main().catch(err => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
