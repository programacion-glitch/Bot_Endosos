import 'dotenv/config';
import { startPolling, markAsSeen, moveToFolder, ensureMailbox, closeImap, RawEmail } from './email/imapClient';
import { parseEmail } from './email/emailParser';
import { dispatchCommands } from './actions/dispatcher';
import { getNowCertsPage, navigateToClient, invalidateSession } from './browser/nowcertsLogin';
import { closeBrowser, screenshot } from './browser/browserManager';
import { sendReviewEmail, sendClientApprovalEmail, sendAlertEmail } from './email/emailSender';
import { findAgentEmails } from './utils/agentLookup';
import { logger, logEmailProcessing } from './utils/logger';
import { ActionResult, Command } from './types';

const PROCESSED_FOLDER = 'H2O-Endosos';

// ─── Subject prefix validation ───────────────────────────────────────────────

type SubjectPrefix = 'BOT-END' | 'DOCUMENTAR CLIENTE';

function getSubjectPrefix(subject: string): SubjectPrefix | null {
  const upper = subject.toUpperCase().trim();
  if (upper.startsWith('DOCUMENTAR CLIENTE')) return 'DOCUMENTAR CLIENTE';
  if (upper.startsWith('BOT-END')) return 'BOT-END';
  return null;
}

function validateCoherence(
  prefix: SubjectPrefix,
  commands: Command[],
): { valid: boolean; reason?: string } {
  const hasCreateInsured = commands.some(c => c.type === 'CREATE_INSURED');

  if (prefix === 'DOCUMENTAR CLIENTE' && !hasCreateInsured) {
    return {
      valid: false,
      reason: 'Subject says DOCUMENTAR CLIENTE but no CREATE_INSURED command found in body',
    };
  }

  if (prefix === 'BOT-END' && hasCreateInsured) {
    return {
      valid: false,
      reason: 'Subject says BOT-END (existing client) but body contains CREATE_INSURED command',
    };
  }

  return { valid: true };
}

async function processEmail(raw: RawEmail): Promise<void> {
  // Validate subject prefix
  const prefix = getSubjectPrefix(raw.subject);
  if (!prefix) {
    logger.warn(`Email subject doesn't match valid prefixes (BOT-END / DOCUMENTAR CLIENTE): "${raw.subject}" — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  const email = parseEmail(raw);

  if (email.commands.length === 0) {
    logger.warn(`No commands found in email: "${email.subject}" — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  // Validate coherence between subject prefix and commands
  const coherence = validateCoherence(prefix, email.commands);
  if (!coherence.valid) {
    logger.warn(`Coherence validation failed for "${email.subject}": ${coherence.reason} — skipping.`);
    await markAsSeen(raw.uid);
    return;
  }

  logEmailProcessing(email.subject, email.commands.length);

  let page = await getNowCertsPage();

  // Navigate to client profile (if it's not a Create Insured command)
  const isCreateInsured = email.commands.some(c => c.type === 'CREATE_INSURED');

  if (!isCreateInsured && email.clientName) {
    const found = await navigateToClient(page, email.clientName, email.usdot);
    if (!found) {
      const alertMsg = `Client not found in NowCerts: "${email.clientName}" (USDOT: ${email.usdot ?? 'N/A'})`;
      logger.error(alertMsg);
      await sendAlertEmail({
        to: email.from,
        subject: `[ERROR] Client not found: ${email.clientName}`,
        body: alertMsg,
      });
      await markAsSeen(raw.uid);
      return;
    }
  }

  // Execute all commands
  let results: ActionResult[];
  try {
    results = await dispatchCommands(page, email);
  } catch (err) {
    logger.error(`Fatal error during command dispatch: ${(err as Error).message}`);
    invalidateSession();
    await markAsSeen(raw.uid);
    return;
  }

  // Collect downloaded files from all successful commands
  const allFiles = results.flatMap(r => r.downloadedFiles ?? []);
  const failures = results.filter(r => !r.success);
  const successes = results.filter(r => r.success);

  // Build changes description for email
  const changesDescription = buildChangesDescription(results);

  // Send review email (proof of insurance)
  if (allFiles.length > 0 && successes.length > 0) {
    try {
      await sendReviewEmail({
        clientName: email.clientName ?? 'Unknown',
        usdot: email.usdot ?? '',
        changesDescription,
        attachments: allFiles,
      });
    } catch (err) {
      logger.error(`Failed to send review email: ${(err as Error).message}`);
    }
  }

  // Move to processed folder if all commands succeeded, otherwise just mark as seen
  if (failures.length === 0) {
    await moveToFolder(raw.uid, PROCESSED_FOLDER);
  } else {
    await markAsSeen(raw.uid);
  }

  logger.info(
    `Email processed: ${successes.length} ok, ${failures.length} failed. ` +
    `Subject: "${email.subject}"`
  );

  if (failures.length > 0) {
    const failSummary = failures.map(f => `${f.commandType}: ${f.message}`).join('\n');
    logger.error(`Failures:\n${failSummary}`);
  }
}

function buildChangesDescription(results: ActionResult[]): string {
  return results
    .map(r => {
      const status = r.success ? '✓' : '✗';
      return `${status} ${r.commandType}: ${r.message}`;
    })
    .join('\n');
}

async function main(): Promise<void> {
  logger.info('=== H2O Bot starting ===');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await closeImap();
    await closeBrowser();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');
    await closeImap();
    await closeBrowser();
    process.exit(0);
  });

  // Ensure the processed-emails folder exists in Gmail
  try {
    await ensureMailbox(PROCESSED_FOLDER);
    logger.info(`Mailbox "${PROCESSED_FOLDER}" ready.`);
  } catch (err) {
    logger.warn(`Could not verify mailbox "${PROCESSED_FOLDER}": ${(err as Error).message}`);
  }

  // Pre-warm browser + login
  try {
    await getNowCertsPage();
    logger.info('NowCerts session established.');
  } catch (err) {
    logger.error(`Failed to log in to NowCerts on startup: ${(err as Error).message}`);
    logger.warn('Will retry on first email...');
  }

  // Start IMAP polling loop
  await startPolling(async (emails: RawEmail[]) => {
    for (const email of emails) {
      try {
        await processEmail(email);
      } catch (err) {
        logger.error(`Unhandled error processing email "${email.subject}": ${(err as Error).message}`);
      }
    }
  });
}

main().catch(err => {
  logger.error(`Fatal startup error: ${err.message}`);
  process.exit(1);
});
