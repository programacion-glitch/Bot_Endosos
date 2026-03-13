import { Page } from 'playwright';
import { AddAIAndWOSCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, todayYYYYMMdd, safeFilenamePart } from './_base';
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate } from './_holderHelpers';

async function selectNgMultiOption(page: Page, index: number, value: string): Promise<boolean> {
  const selects = page.locator('ng-select');
  if (await selects.count() <= index) return false;

  const select = selects.nth(index);
  await select.click({ force: true });
  await page.waitForTimeout(600);

  const option = page.locator('ng-dropdown-panel .ng-option').filter({
    hasText: new RegExp(escapeRegex(value), 'i'),
  }).first();

  if (await option.count() === 0) {
    await page.keyboard.press('Escape').catch(() => {});
    return false;
  }

  await option.click({ force: true });
  await page.waitForTimeout(300);
  return true;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

function policyLineLabel(policy: string): string {
  // Must match exact row text in the "Additional Interest for Certificates" table.
  // EXL = "Umbrella Liability" (not "Excess") — confirmed live 2026-03-13.
  const map: Record<string, string> = {
    AL: 'Automobile Liability',
    NTL: 'Automobile Liability',
    GL: 'General Liability',
    WC: 'Workers Compensation',
    MTC: 'Cargo',
    APD: 'Physical Damage',
    EXL: 'Umbrella Liability',
  };
  return map[policy.toUpperCase()] ?? policy;
}

function policySelectionLabel(policy: string): string {
  const map: Record<string, string> = {
    AL: 'Commercial Auto',
    NTL: 'Commercial Auto',
    GL: 'General Liability',
    WC: "Worker's Compensation",
    MTC: 'Cargo',
    APD: 'Physical Damage',
    EXL: 'Umbrella',
  };
  return map[policy.toUpperCase()] ?? policyLineLabel(policy);
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

function wosCheckbox(page: Page, policy: string) {
  const key = policy.toUpperCase();
  if (key === 'WC') {
    // WC row only has one checkbox: #workersCompensationSubrWvd (confirmed live)
    return page.locator('#workersCompensationSubrWvd').first();
  }

  // For GL/AL/EXL: SUBR WVD is the 2nd checkbox (id="") in the row.
  // Row label confirmed live: GL="General Liability", AL="Automobile Liability", EXL="Umbrella Liability"
  const label = policyLineLabel(policy);
  const row = page.locator('table tr').filter({ hasText: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, 'i') }).first();
  return row.locator('input[type="checkbox"]').nth(1);
}
