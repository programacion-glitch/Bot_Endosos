import { Page } from 'playwright';
import { AddWaiverSubrogationCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, todayYYYYMMdd, safeFilenamePart } from './_base';
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate, selectNgMultiOption, policySelectionLabel, wosCheckbox, writeDescriptionOfOperations } from './_holderHelpers';

/**
 * ADD WAIVER OF SUBROGATION to AL/GL/WC (or combinations)
 */
export async function addWaiverSubrogation(
  page: Page,
  cmd: AddWaiverSubrogationCommand
): Promise<ActionResult> {
  logger.info(`addWaiverSubrogation: holder="${cmd.holder.name}" policies=${cmd.policies.join(',')}`);

  try {
    await openAdditionalInterestInsert(page);

    await searchOrCreateHolder(page, cmd.holder);

    for (const policy of cmd.policies) {
      await page.waitForTimeout(1500);

      const checkbox = wosCheckbox(page, policy);
      if (await checkbox.count() === 0) {
        logger.warn(`WOS checkbox not found for policy row: ${policy}`);
        continue;
      }

      await checkbox.check({ force: true }).catch(async () => {
        await checkbox.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(500);

      // Retry logic for slow-loading policy dropdown
      let foundPolicy = false;
      for (let attempt = 0; attempt < 3 && !foundPolicy; attempt++) {
        if (attempt > 0) await page.waitForTimeout(1000);
        foundPolicy = await selectNgMultiOption(page, 2, policySelectionLabel(policy));
      }
      if (!foundPolicy) {
        logger.warn(`Policy selector option not found for ${policy}`);
      }
    }

    if (cmd.holder.note) {
      await writeDescriptionOfOperations(page, cmd.holder.note);
    }

    const saveBtn = page.locator('button, span.btn-loading, input[type="submit"]').filter({ hasText: /Save Changes/i }).first();
    await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await saveBtn.click({ force: true });
    await waitForSaveConfirmation(page);

    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder WOS (${safeFilenamePart(cmd.holder.name)}).pdf`;
    const files = await downloadCertificate(page, filename, cmd.holder.name, cmd.holder.note).catch(err => {
      logger.warn(`downloadCertificate not completed yet: ${(err as Error).message}`);
      return [];
    });

    return ok('ADD_WAIVER_SUBROGATION', `WOS added for holder "${cmd.holder.name}"`, files);
  } catch (err) {
    return fail('ADD_WAIVER_SUBROGATION', (err as Error).message, err as Error);
  }
}
