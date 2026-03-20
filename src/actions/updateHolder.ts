import { Page } from 'playwright';
import { UpdateHolderCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, todayYYYYMMdd, safeFilenamePart, waitForSaveConfirmation, escapeRegex } from './_base';
import { downloadCertificate } from './_holderHelpers';

function looksLikeAddressUpdate(value: string): boolean {
  const trimmed = value.trim();
  return /,/.test(trimmed) || /^\d/.test(trimmed) || /\b[A-Z]{2}\b/.test(trimmed) || /\b\d{5}(?:-\d{4})?\b/.test(trimmed);
}

function parseAddress(value: string) {
  const parts = value.split(',').map(x => x.trim()).filter(Boolean);
  return {
    address1: parts[0] ?? value.trim(),
    city: parts[1] ?? '',
    state: parts[2] ?? '',
    zip: parts[3] ?? '',
  };
}

async function selectState(page: Page, value: string): Promise<void> {
  if (!value) return;
  const select = page.locator('ng-select').first();
  if (await select.count() === 0) return;

  await select.click({ force: true });
  await page.waitForTimeout(300);
  const input = select.locator('input[aria-autocomplete="list"]').first();
  if (await input.count() > 0) {
    await input.fill(value);
    await page.waitForTimeout(500);
  }

  const exact = page.locator('ng-dropdown-panel .ng-option').filter({
    hasText: new RegExp(`^${escapeRegex(value)}$`, 'i'),
  }).first();
  const partial = page.locator('ng-dropdown-panel .ng-option').filter({
    hasText: new RegExp(escapeRegex(value), 'i'),
  }).first();

  if (await exact.count() > 0) {
    await exact.click({ force: true });
    await page.waitForTimeout(250);
    return;
  }
  if (await partial.count() > 0) {
    await partial.click({ force: true });
    await page.waitForTimeout(250);
    return;
  }

  await page.keyboard.press('Escape').catch(() => {});
}

/**
 * UPDATE HOLDER'S NAME / ADDRESS
 * - Open Additional Interests
 * - Find holder row
 * - Actions -> Edit
 * - Update either company name or address fields
 * - Save
 * - Send Certificate -> add all vehicles/drivers -> download
 */
export async function updateHolder(page: Page, cmd: UpdateHolderCommand): Promise<ActionResult> {
  logger.info(`updateHolder: "${cmd.holderName}" -> "${cmd.updateTo}"`);

  try {
    if (!page.url().includes('/AdditionalInterests')) {
      const tab = page.locator('a.tab-link[href*="/AdditionalInterests"]').first();
      await tab.click({ force: true });
      await page.waitForURL('**/AMSINS/Insureds/Details/*/AdditionalInterests', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    const row = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(cmd.holderName), 'i') }).first();
    if (await row.count() === 0) {
      throw new Error(`Holder row not found: ${cmd.holderName}`);
    }

    await row.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true });
    await page.waitForTimeout(700);
    await page.locator('li, a, span').filter({ hasText: /^Edit$/i }).first().click({ force: true });
    await page.waitForTimeout(2500);

    const isAddress = looksLikeAddressUpdate(cmd.updateTo);
    const companyNameInput = page.locator('input[placeholder="Company Name"]').first();
    const address1Input = page.locator('input[placeholder="Address Line 1"]').first();
    const cityInput = page.locator('input[placeholder="City"]').first();
    const zipInput = page.locator('input[placeholder="Zip/Postal Code"]').first();

    if (isAddress) {
      const address = parseAddress(cmd.updateTo);
      await address1Input.fill(address.address1);
      if (address.city) await cityInput.fill(address.city);
      if (address.state) await selectState(page, address.state);
      if (address.zip) await zipInput.fill(address.zip);
    } else {
      await companyNameInput.fill(cmd.updateTo);
    }

    if (cmd.note) {
      await page.fill('textarea[placeholder="Description of Operations"]', cmd.note);
    }

    const saveBtn = page.locator('span.btn-loading').filter({ hasText: /^Save Changes$/i }).first();
    if (await saveBtn.count() > 0) {
      await saveBtn.click({ force: true });
    } else {
      await page.locator('text=Save Changes').first().click({ force: true });
    }
    await waitForSaveConfirmation(page);

    const effectiveHolderName = isAddress ? cmd.holderName : cmd.updateTo;
    const filename = `${todayYYYYMMdd()} Certificate Holder (${safeFilenamePart(effectiveHolderName)}).pdf`;
    const files = await downloadCertificate(page, filename, effectiveHolderName, cmd.note).catch(err => {
      logger.warn(`downloadCertificate not completed yet: ${(err as Error).message}`);
      return [];
    });

    return ok('UPDATE_HOLDER', `Holder "${cmd.holderName}" updated to "${cmd.updateTo}"`, files);
  } catch (err) {
    return fail('UPDATE_HOLDER', (err as Error).message, err as Error);
  }
}
