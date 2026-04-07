import { Page } from 'playwright';
import { RemoveDriverCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail } from './_base';

/**
 * REMOVE DRIVER
 * Archive the driver from the insured items list.
 */
export async function removeDriver(page: Page, cmd: RemoveDriverCommand): Promise<ActionResult> {
  const { driver } = cmd;
  logger.info(`removeDriver: ${driver.firstName} ${driver.lastName}`);

  try {
    // Confirmed live flow:
    // insured -> Insured Items -> Drivers -> row Actions -> Archive
    await page.locator('button').filter({ hasText: /^Insured Items$/i }).first().click();
    await page.waitForTimeout(500);
    await page.locator('a[href*="/Drivers"]').first().click();
    await page.waitForURL('**/AMSINS/Insureds/Details/*/Drivers', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);

    // Find driver row by name
    const fullName = `${driver.firstName} ${driver.lastName}`;
    const row = page.locator('tr').filter({ hasText: new RegExp(`${driver.firstName}.*${driver.lastName}|${driver.lastName}`, 'i') }).first();
    await row.locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('li.k-item, span').filter({ hasText: /^Archive$/i }).first().click({ force: true });

    const popupSave = page.locator(
      'div[batch-action-form-simple-buttons] span.btn.btn-primary.cursor-pointer'
    ).filter({ hasText: /^Save Changes$/i }).first();
    await popupSave.waitFor({ state: 'visible', timeout: 10_000 });
    await popupSave.click({ force: true });
    await page.waitForTimeout(3000);

    // Check for error message from NowCerts
    const errorMsg = page.locator('text=There was a problem while changing active status');
    if (await errorMsg.count() > 0) {
      return fail('REMOVE_DRIVER', `NowCerts rejected archive for driver ${fullName}: "There was a problem while changing active status"`);
    }

    // Validate: reload drivers page and confirm driver is no longer in active list
    await page.locator('a[href*="/Drivers"]').first().click();
    await page.waitForURL('**/AMSINS/Insureds/Details/*/Drivers', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const namePattern = new RegExp(`${driver.firstName}.*${driver.lastName}|${driver.lastName}`, 'i');
    const stillVisible = page.locator('tr').filter({ hasText: namePattern });
    const count = await stillVisible.count();
    if (count > 0) {
      logger.warn(`removeDriver: ${fullName} still visible in drivers list after archive — retrying`);
      await stillVisible.first().locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
      await page.waitForTimeout(500);
      await page.locator('li.k-item, span').filter({ hasText: /^Archive$/i }).first().click({ force: true });
      const popupSave2 = page.locator(
        'div[batch-action-form-simple-buttons] span.btn.btn-primary.cursor-pointer'
      ).filter({ hasText: /^Save Changes$/i }).first();
      await popupSave2.waitFor({ state: 'visible', timeout: 10_000 });
      await popupSave2.click({ force: true });
      await page.waitForTimeout(3000);

      // Check for error on retry
      if (await errorMsg.count() > 0) {
        return fail('REMOVE_DRIVER', `NowCerts rejected archive for driver ${fullName} on retry`);
      }

      // Validate again
      await page.locator('a[href*="/Drivers"]').first().click();
      await page.waitForURL('**/AMSINS/Insureds/Details/*/Drivers', { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const stillVisible2 = await page.locator('tr').filter({ hasText: namePattern }).count();
      if (stillVisible2 > 0) {
        return fail('REMOVE_DRIVER', `Driver ${fullName} still visible after 2 archive attempts`);
      }
      logger.info(`removeDriver: ${fullName} confirmed archived on retry`);
    } else {
      logger.info(`removeDriver: ${fullName} confirmed not in active drivers list`);
    }

    return ok('REMOVE_DRIVER', `Driver ${fullName} archived (verified).`);
  } catch (err) {
    return fail('REMOVE_DRIVER', (err as Error).message, err as Error);
  }
}
