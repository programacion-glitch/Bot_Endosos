import { Page } from 'playwright';
import { AddAdditionalInsuredCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, todayYYYYMMdd, safeFilenamePart } from './_base';
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate, selectNgMultiOption, policySelectionLabel, writeDescriptionOfOperations } from './_holderHelpers';

/**
 * ADD ADDITIONAL INSURED to AL/GL (or combinations)
 * Steps:
 * 1. Additional Interest -> Add New
 * 2. Search/create holder
 * 3. Check AI checkbox for the relevant policy lines
 * 4. Select relevant policies
 * 5. Add note (if any)
 * 6. Save
 * 7. Actions -> Send Certificate -> add all vehicles+drivers -> download
 */
export async function addAdditionalInsured(
  page: Page,
  cmd: AddAdditionalInsuredCommand
): Promise<ActionResult> {
  logger.info(`addAdditionalInsured: holder="${cmd.holder.name}" policies=${cmd.policies.join(',')}`);

  try {
    // Confirmed live rule from user:
    // always open Additional Interests tab first, then click that tab's Add New.
    await openAdditionalInterestInsert(page);

    await searchOrCreateHolder(page, cmd.holder);

    // Wait for the form to fully load before interacting with policy checkboxes
    await page.waitForTimeout(1500);

    for (const policy of cmd.policies) {
      const checkboxId = aiCheckboxId(policy);
      if (!checkboxId) {
        logger.warn(`AI checkbox id not mapped for policy: ${policy}`);
        continue;
      }

      const checkbox = page.locator(`#${checkboxId}`).first();
      if (await checkbox.count() === 0) {
        logger.warn(`AI checkbox not found for policy row: ${policy}`);
        continue;
      }

      await checkbox.check({ force: true }).catch(async () => {
        await checkbox.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(500);

      // Try selecting the policy with retries (dropdown may load slowly)
      let foundPolicy = false;
      for (let attempt = 0; attempt < 3 && !foundPolicy; attempt++) {
        if (attempt > 0) await page.waitForTimeout(1000);
        foundPolicy = await selectNgMultiOption(page, 2, policySelectionLabel(policy));
      }
      if (!foundPolicy) {
        logger.warn(`Policy selector option not found for ${policy}`);
      }
    }

    // Note
    if (cmd.holder.note) {
      await writeDescriptionOfOperations(page, cmd.holder.note);
    }

    // Save - try multiple selectors for the Save Changes button
    const saveBtn = page.locator('span.btn-loading, button, input[type="submit"]').filter({ hasText: /Save Changes/i }).first();
    await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await saveBtn.click({ force: true });
    await waitForSaveConfirmation(page);

    // Download certificate
    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder AI (${safeFilenamePart(cmd.holder.name)}).pdf`;
    const files = await downloadCertificate(page, filename, cmd.holder.name, cmd.holder.note).catch(err => {
      logger.warn(`downloadCertificate not completed yet: ${(err as Error).message}`);
      return [];
    });

    return ok('ADD_ADDITIONAL_INSURED', `AI added for holder "${cmd.holder.name}"`, files);
  } catch (err) {
    return fail('ADD_ADDITIONAL_INSURED', (err as Error).message, err as Error);
  }
}

function aiCheckboxId(policy: string): string | null {
  const map: Record<string, string> = {
    AL: 'automobileLiability',
    GL: 'generalLiability',
    EXL: 'umbrellaLiability',
  };
  return map[policy.toUpperCase()] ?? null;
}
