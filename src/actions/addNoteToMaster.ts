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
    await page.locator('.k-animation-container .k-item, .k-menu-popup .k-item').filter({ hasText: /^Edit$/i }).first().click();

    // Wait for modal popup (rwPopup iframe) or full-page navigation
    await page.waitForURL('**/Certificates/Edit.aspx**', { timeout: 5_000 }).catch(() => {});
    let editContext: typeof page | ReturnType<typeof page.frame> = page;

    if (page.url().includes('/Certificates/Edit.aspx')) {
      await page.waitForTimeout(3000);
    } else {
      // Modal — wait for rwPopup iframe
      let found = false;
      for (let attempt = 0; attempt < 6 && !found; attempt++) {
        await page.waitForTimeout(2000 + attempt * 1000);
        const frame = page.frame({ name: 'rwPopup' });
        if (frame) { editContext = frame; found = true; break; }
        for (const f of page.frames()) {
          if (f === page.mainFrame()) continue;
          const has = await f.locator('#ContentPlaceHolder1_usrAcord25_txtDescription').count().catch(() => 0);
          if (has > 0) { editContext = f; found = true; break; }
        }
      }
      if (!found) throw new Error('Master certificate edit modal did not load');
    }

    const descField = editContext.locator('#ContentPlaceHolder1_usrAcord25_txtDescription').first();
    await descField.waitFor({ state: 'visible', timeout: 15_000 });
    await descField.scrollIntoViewIfNeeded();

    const existing = await descField.inputValue();
    const next = existing.trim()
      ? `${existing.replace(/\s+$/, '')}\n${cmd.note}`
      : cmd.note;

    // Clear and type the note — use evaluate + fill to handle special chars like $ in iframes
    await descField.evaluate((el: any, value: string) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, next);
    // Verify the value was set, if not retry with fill
    const written = await descField.inputValue().catch(() => '');
    if (written !== next) {
      logger.warn('addNoteToMaster: evaluate did not set full value, retrying with fill...');
      await descField.fill(next);
    }
    const updateBtn = editContext.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').first();
    await updateBtn.scrollIntoViewIfNeeded().catch(() => {});
    await updateBtn.evaluate((el: any) => el.click());
    await page.waitForTimeout(5000);

    return ok('ADD_NOTE_TO_MASTER', 'Note added to master certificate.');
  } catch (err) {
    return fail('ADD_NOTE_TO_MASTER', (err as Error).message, err as Error);
  }
}
