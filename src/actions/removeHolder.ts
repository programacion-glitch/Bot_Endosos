import { Page } from 'playwright';
import { RemoveHolderCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, escapeRegex, getInsuredUrl } from './_base';

/**
 * REMOVE HOLDER
 * Archive the holder from the Additional Interests list.
 * Important: ID Cards are NOT deleted.
 */
export async function removeHolder(page: Page, cmd: RemoveHolderCommand): Promise<ActionResult> {
  logger.info(`removeHolder: "${cmd.holderName}"`);

  try {
    const aiUrl = getInsuredUrl(page, 'AdditionalInterests');
    await page.goto(aiUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Find the holder row by name
    const row = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(cmd.holderName), 'i') }).first();
    if (await row.count() === 0) {
      return fail('REMOVE_HOLDER', `Holder not found: "${cmd.holderName}"`);
    }

    await row.locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('li.k-item, span, a').filter({ hasText: /^Archive$/i }).first().click({ force: true });

    // Confirm the archive popup if it appears
    const popupSave = page.locator(
      'div[batch-action-form-simple-buttons] span.btn.btn-primary.cursor-pointer'
    ).filter({ hasText: /^Save Changes$/i }).first();
    const confirmBtn = page.locator('button, span').filter({ hasText: /^(Yes|OK|Confirm|Save Changes)$/i }).first();

    if (await popupSave.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await popupSave.click({ force: true });
    } else if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click({ force: true });
    }
    await page.waitForTimeout(3000);

    // Validate: reload and confirm holder is no longer visible
    await page.goto(aiUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const stillVisible = await page.locator('tr').filter({ hasText: new RegExp(escapeRegex(cmd.holderName), 'i') }).count();
    if (stillVisible > 0) {
      return fail('REMOVE_HOLDER', `Holder "${cmd.holderName}" still visible after archive attempt`);
    }

    logger.info(`removeHolder: "${cmd.holderName}" confirmed archived`);
    return ok('REMOVE_HOLDER', `Holder "${cmd.holderName}" archived.`);
  } catch (err) {
    return fail('REMOVE_HOLDER', (err as Error).message, err as Error);
  }
}
