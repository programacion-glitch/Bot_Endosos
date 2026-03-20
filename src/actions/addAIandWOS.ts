import { Page } from 'playwright';
import { AddAIAndWOSCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, todayYYYYMMdd, safeFilenamePart } from './_base';
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate, selectNgMultiOption, policyLineLabel, policySelectionLabel, wosCheckbox } from './_holderHelpers';

/**
 * ADD ADDITIONAL INSURED & WAIVER OF SUBROGATION
 * Marks both AI and WOS checkboxes for the relevant policy lines.
 */
export async function addAIandWOS(
  page: Page,
  cmd: AddAIAndWOSCommand
): Promise<ActionResult> {
  logger.info(`addAIandWOS: holder="${cmd.holder.name}" policies=${cmd.policies.join(',')}`);

  try {
    await openAdditionalInterestInsert(page);

    await searchOrCreateHolder(page, cmd.holder);

    for (const policy of cmd.policies) {
      await page.waitForTimeout(1500);

      const ai = aiCheckbox(page, policy);
      const wos = wosCheckbox(page, policy);

      if (await ai.count() > 0) {
        await ai.check({ force: true }).catch(async () => {
          await ai.evaluate((el: any) => el.click());
        });
      } else {
        logger.warn(`AI checkbox not found for policy row: ${policy}`);
      }

      if (await wos.count() > 0) {
        await wos.check({ force: true }).catch(async () => {
          await wos.evaluate((el: any) => el.click());
        });
      } else {
        logger.warn(`WOS checkbox not found for policy row: ${policy}`);
      }

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
      await page.fill('textarea[placeholder="Description of Operations"]', cmd.holder.note);
    }

    const saveBtn = page.locator('button, span.btn-loading, input[type="submit"]').filter({ hasText: /Save Changes/i }).first();
    await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await saveBtn.click({ force: true });
    await waitForSaveConfirmation(page);

    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder AI & WOS (${safeFilenamePart(cmd.holder.name)}).pdf`;
    const files = await downloadCertificate(page, filename, cmd.holder.name, cmd.holder.note).catch(err => {
      logger.warn(`downloadCertificate not completed yet: ${(err as Error).message}`);
      return [];
    });

    return ok('ADD_AI_AND_WOS', `AI & WOS added for holder "${cmd.holder.name}"`, files);
  } catch (err) {
    return fail('ADD_AI_AND_WOS', (err as Error).message, err as Error);
  }
}

function aiCheckbox(page: Page, policy: string) {
  const map: Record<string, string> = {
    AL: '#automobileLiability',
    GL: '#generalLiability',
    EXL: '#umbrellaLiability',
  };
  const selector = map[policy.toUpperCase()];
  if (selector) return page.locator(selector).first();

  const row = page.locator('tr').filter({ hasText: new RegExp(policyLineLabel(policy), 'i') }).first();
  return row.locator('input[type="checkbox"]').first();
}
