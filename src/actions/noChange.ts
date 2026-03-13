import { ActionResult } from '../types';
import { replyRecibido } from '../email/emailSender';
import { logger } from '../utils/logger';
import { ok } from './_base';

/**
 * NO CHANGE
 * Just reply to the sender with "Recibido".
 */
export async function noChange(fromEmail: string): Promise<ActionResult> {
  logger.info(`noChange: sending "Recibido" to ${fromEmail}`);
  await replyRecibido(fromEmail);
  return ok('NO_CHANGE', 'Replied "Recibido".');
}
