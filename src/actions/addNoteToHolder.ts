import { Page } from 'playwright';
import { AddNoteToHolderCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, todayYYYYMMdd, safeFilenamePart } from './_base';
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate } from './_holderHelpers';

/**
 * ADD NOTE TO HOLDER
 * 1. Additional Interests tab -> Add New
 * 2. Search/create holder
 * 3. Add note in Description of Operations
 * 4. Save
 * 5. Actions -> Send Certificate
 * 6. Add all vehicles and drivers
 * 7. Download PDF
 */
export async function addNoteToHolder(
  page: Page,
  cmd: AddNoteToHolderCommand
): Promise<ActionResult> {
  logger.info(`addNoteToHolder: holder="${cmd.holder.name}"`);

  try {
    await openAdditionalInterestInsert(page);
    await searchOrCreateHolder(page, cmd.holder);

    if (cmd.holder.note) {
      await page.fill('textarea[placeholder="Description of Operations"]', cmd.holder.note);
    }

    await page.locator('span.btn-loading').filter({ hasText: /^Save Changes$/i }).first().click({ force: true });
    await waitForSaveConfirmation(page);

    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder (${safeFilenamePart(cmd.holder.name)}).pdf`;
    const files = await downloadCertificate(page, filename, cmd.holder.name, cmd.holder.note).catch(err => {
      logger.warn(`downloadCertificate not completed yet: ${(err as Error).message}`);
      return [];
    });

    return ok('ADD_NOTE_TO_HOLDER', `Note added to holder "${cmd.holder.name}"`, files);
  } catch (err) {
    return fail('ADD_NOTE_TO_HOLDER', (err as Error).message, err as Error);
  }
}
