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

/** Subject prefixes the bot recognises */
const VALID_SUBJECT_PREFIXES = ['BOT-END', 'DOCUMENTAR CLIENTE'];

/**
 * Fetches UNSEEN emails whose subject starts with a valid prefix.
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

  // Server-side filter: UNSEEN + subject contains BOT-END or DOCUMENTAR CLIENTE
  const messages = await conn.search(
    [
      'UNSEEN',
      ['OR',
        ['HEADER', 'SUBJECT', 'BOT-END'],
        ['HEADER', 'SUBJECT', 'DOCUMENTAR CLIENTE'],
      ],
    ],
    {
      bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)', 'TEXT', ''],
      markSeen: false,
    },
  );

  if (messages.length === 0) {
    logger.debug('No new emails found.');
    return [];
  }

  logger.info(`Found ${messages.length} unseen email(s) matching subject filter.`);

  const emails: RawEmail[] = [];

  for (const message of messages) {
    try {
      emails.push(await parseMessage(message));
    } catch (err) {
      logger.error(`Failed to parse email: ${(err as Error).message}`);
    }
  }

  // Client-side safety net: verify subject actually starts with a valid prefix
  return emails.filter(e => {
    const upper = e.subject.toUpperCase().trim();
    const valid = VALID_SUBJECT_PREFIXES.some(p => upper.startsWith(p));
    if (!valid) {
      logger.debug(`Skipping email with non-matching subject: "${e.subject}"`);
    }
    return valid;
  });
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
 * Ensures a mailbox (Gmail label/folder) exists, creating it if necessary.
 */
export async function ensureMailbox(mailboxName: string): Promise<void> {
  const conn = await getConnection();
  const rawImap = (conn as any)._imap;
  return new Promise<void>((resolve) => {
    rawImap.addBox(mailboxName, (err: Error | null) => {
      if (err) {
        logger.debug(`Mailbox "${mailboxName}" check: ${err.message}`);
      } else {
        logger.info(`Created mailbox "${mailboxName}".`);
      }
      resolve();
    });
  });
}

/**
 * Moves an email from INBOX to a destination folder by UID.
 */
export async function moveToFolder(uid: number, folder: string): Promise<void> {
  try {
    const conn = await getConnection();
    await conn.openBox(config.imap.mailbox);
    const rawImap = (conn as any)._imap;
    await new Promise<void>((resolve, reject) => {
      rawImap.move(uid, folder, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
    logger.debug(`Email UID ${uid} moved to "${folder}".`);
  } catch (err) {
    logger.warn(`Could not move UID ${uid} to "${folder}": ${(err as Error).message}. Marking as seen instead.`);
    await markAsSeen(uid);
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
