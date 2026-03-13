import { Page } from 'playwright';
import { AddNoteToMasterCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail } from './_base';

/**
 * ADD NOTE TO MASTER
 * 1. Documents -> Certificates (Master)
 * 2. Require exactly one certificate row
 * 3. Actions -> Edit
 * 4. Append note in Description of Operations
 * 5. Update
 */
export async function addNoteToMaster(
  page: Page,
  cmd: AddNoteToMasterCommand
): Promise<ActionResult> {
  logger.info(`addNoteToMaster: note="${cmd.note.substring(0, 40)}..."`);

  try {
    await page.locator('button').filter({ hasText: /^Documents$/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('a').filter({ hasText: /^Certificates \(Master\)$/i }).first().click({ force: true });
    await page.waitForTimeout(2000);

    const certRows = page.locator('table tbody tr').filter({
      has: page.locator('button, a, span').filter({ hasText: /Actions/i }),
    });
    const count = await certRows.count();
    if (count !== 1) {
      throw new Error(`Expected exactly 1 master certificate row, found ${count}`);
    }

    const row = certRows.first();
    await row.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true });
    await page.waitForTimeout(700);
    await page.locator('li, a, span').filter({ hasText: /^Edit$/i }).first().click({ force: true });

    const popup = page.locator('iframe[name="rwPopup"]').first();
    await popup.waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(3000);

    const frame = page.frame({ name: 'rwPopup' });
    if (!frame) {
      throw new Error('Master certificate edit popup did not load');
    }

    const descField = frame.locator('#ContentPlaceHolder1_usrAcord25_txtDescription').first();
    await descField.waitFor({ state: 'visible', timeout: 15_000 });
    await descField.scrollIntoViewIfNeeded();

    const existing = await descField.inputValue();
    const next = existing.trim()
      ? `${existing.replace(/\s+$/, '')}\n${cmd.note}`
      : cmd.note;

    await descField.fill(next);
    const updateBtn = frame.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').first();
    await updateBtn.scrollIntoViewIfNeeded().catch(() => {});
    await updateBtn.evaluate((el: any) => el.click());
    await page.waitForTimeout(5000);

    return ok('ADD_NOTE_TO_MASTER', 'Note added to master certificate.');
  } catch (err) {
    return fail('ADD_NOTE_TO_MASTER', (err as Error).message, err as Error);
  }
}
