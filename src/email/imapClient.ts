import imapSimple, { ImapSimple, Message } from 'imap-simple';
import { simpleParser } from 'mailparser';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { sleep } from '../utils/retry';

export interface RawEmail {
  uid: number;
  subject: string;
  from: string;
  to: string;
  body: string;
  date: Date;
}

let connection: ImapSimple | null = null;

async function getConnection(): Promise<ImapSimple> {
  if (connection) return connection;

  logger.info('Connecting to IMAP server...');
  connection = await imapSimple.connect({
    imap: {
      host: config.imap.host,
      port: config.imap.port,
      user: config.imap.user,
      password: config.imap.password,
      tls: config.imap.tls,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
    },
  });

  // Handle connection close/error
  (connection as any).on('error', (err: Error) => {
    logger.error(`IMAP connection error: ${err.message}`);
    connection = null;
  });
  (connection as any).on('close', () => {
    logger.warn('IMAP connection closed.');
    connection = null;
  });

  logger.info('IMAP connection established.');
  return connection;
}

/**
 * Fetches all UNSEEN emails from the inbox.
 */
export async function fetchUnseenEmails(): Promise<RawEmail[]> {
  let conn: ImapSimple;
  try {
    conn = await getConnection();
  } catch (err) {
    connection = null;
    throw new Error(`Failed to connect to IMAP: ${(err as Error).message}`);
  }

  await conn.openBox(config.imap.mailbox);

  const messages = await conn.search(['UNSEEN'], {
    bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT', ''],
    markSeen: false, // We mark as seen after successful processing
  });

  if (messages.length === 0) {
    logger.debug('No new emails found.');
    return [];
  }

  logger.info(`Found ${messages.length} unseen email(s).`);

  const emails: RawEmail[] = [];

  for (const message of messages) {
    try {
      const raw = emails.push(await parseMessage(message));
    } catch (err) {
      logger.error(`Failed to parse email: ${(err as Error).message}`);
    }
  }

  return emails;
}

async function parseMessage(message: Message): Promise<RawEmail> {
  // Get the full raw body
  const allPart = message.parts.find(p => p.which === '');
  const rawBody = allPart?.body ?? '';

  const parsed = await simpleParser(rawBody);

  const uid = message.attributes.uid;
  const subject = parsed.subject ?? '(no subject)';
  const from = parsed.from?.text ?? '';
  const toObj = parsed.to;
  const to = toObj
    ? Array.isArray(toObj)
      ? toObj.map((a: { text: string }) => a.text).join(', ')
      : (toObj as { text: string }).text
    : '';
  const body: string = parsed.text ?? (typeof parsed.html === 'string' ? parsed.html : '') ?? '';
  const date = parsed.date ?? new Date();

  return { uid, subject, from, to, body, date };
}

/**
 * Marks an email as SEEN by UID.
 */
export async function markAsSeen(uid: number): Promise<void> {
  try {
    const conn = await getConnection();
    await conn.addFlags(uid, ['\\Seen']);
    logger.debug(`Email UID ${uid} marked as SEEN.`);
  } catch (err) {
    logger.warn(`Could not mark UID ${uid} as SEEN: ${(err as Error).message}`);
  }
}

/**
 * Closes the IMAP connection gracefully.
 */
export async function closeImap(): Promise<void> {
  if (connection) {
    try {
      await connection.end();
    } catch {
      // ignore
    }
    connection = null;
    logger.info('IMAP connection closed.');
  }
}

/**
 * Main polling loop. Calls the callback with each batch of new emails.
 * Continues indefinitely until the process is killed.
 */
export async function startPolling(
  onEmails: (emails: RawEmail[]) => Promise<void>
): Promise<void> {
  logger.info(`Starting IMAP polling every ${config.imap.pollIntervalMs / 1000}s...`);

  while (true) {
    try {
      const emails = await fetchUnseenEmails();
      if (emails.length > 0) {
        await onEmails(emails);
      }
    } catch (err) {
      logger.error(`Polling error: ${(err as Error).message}`);
      // Reset connection on error
      connection = null;
    }

    await sleep(config.imap.pollIntervalMs);
  }
}
