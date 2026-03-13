import { Page } from 'playwright';
import { AddWaiverSubrogationCommand, ActionResult } from '../types';
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
      await page.fill('textarea[placeholder="Description of Operations"]', cmd.holder.note);
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
