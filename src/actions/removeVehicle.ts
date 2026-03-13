import { Page } from 'playwright';
import { RemoveVehicleCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail } from './_base';

/**
 * REMOVE VEHICLE / TRAILER
 * Archive the vehicle from the insured items list.
 * NOTE: ID Cards are NOT deleted.
 */
export async function removeVehicle(page: Page, cmd: RemoveVehicleCommand): Promise<ActionResult> {
  logger.info(`removeVehicle: VIN=${cmd.vin}`);

  try {
    // Confirmed live flow:
    // insured -> Insured Items -> Vehicles -> row Actions -> Archive
    await page.locator('button').filter({ hasText: /^Insured Items$/i }).first().click();
    await page.waitForTimeout(500);
    await page.locator('a[href*="/Vehicles"]').first().click();
    await page.waitForURL('**/AMSINS/Insureds/Details/*/Vehicles', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);

    // Find the vehicle row by VIN
    const row = page.locator('tr').filter({ hasText: cmd.vin }).first();
    await row.locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('li.k-item, span').filter({ hasText: /^Archive$/i }).first().click({ force: true });

    // Confirmed popup:
    // "Change Active Status" -> "Selected records will be moved to history status."
    // Save button is a span.btn.btn-primary.cursor-pointer inside batch-action-form-simple-buttons
    const popupSave = page.locator(
      'div[batch-action-form-simple-buttons] span.btn.btn-primary.cursor-pointer'
    ).filter({ hasText: /^Save Changes$/i }).first();
    await popupSave.waitFor({ state: 'visible', timeout: 10_000 });
    await popupSave.click({ force: true });
    await page.waitForTimeout(2500);
    return ok('REMOVE_VEHICLE', `Vehicle VIN ${cmd.vin} archived.`);
  } catch (err) {
    return fail('REMOVE_VEHICLE', (err as Error).message, err as Error);
  }
}
