import { logger } from './logger';
import { config } from '../config/config';

/**
 * Executes an async function with automatic retry on failure.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number = config.retry.maxRetries,
  delayMs: number = config.retry.delayMs
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        logger.warn(`[RETRY] ${label} - Attempt ${attempt}/${maxRetries} failed: ${lastError.message}. Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      } else {
        logger.error(`[RETRY] ${label} - All ${maxRetries} attempts failed.`);
      }
    }
  }

  throw lastError;
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
