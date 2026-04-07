import { Page } from 'playwright';
import { RemoveVehicleCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, getInsuredUrl } from './_base';

/**
 * REMOVE VEHICLE / TRAILER
 * Archive the vehicle from the insured items list.
 * NOTE: ID Cards are NOT deleted.
 */
export async function removeVehicle(page: Page, cmd: RemoveVehicleCommand): Promise<ActionResult> {
  logger.info(`removeVehicle: VIN=${cmd.vin}`);

  try {
    // Capture the insured's vehicles URL before any navigation that might lose context
    const vehiclesUrl = getInsuredUrl(page, 'Vehicles');

    // Confirmed live flow:
    // insured -> Insured Items -> Vehicles -> row Actions -> Archive
    await page.goto(vehiclesUrl);
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
    await page.waitForTimeout(3000);

    // Check for error message from NowCerts
    const errorMsg = page.locator('text=There was a problem while changing active status');
    if (await errorMsg.count() > 0) {
      return fail('REMOVE_VEHICLE', `NowCerts rejected archive for VIN ${cmd.vin}: "There was a problem while changing active status"`);
    }

    // Validate: reload vehicles page and confirm VIN is no longer in active list
    await page.goto(vehiclesUrl);
    await page.waitForTimeout(2000);

    const stillVisible = page.locator('tr').filter({ hasText: cmd.vin });
    const count = await stillVisible.count();
    if (count > 0) {
      logger.warn(`removeVehicle: VIN ${cmd.vin} still visible in table after archive — retrying`);
      // Retry: click Actions -> Archive again
      await stillVisible.first().locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
      await page.waitForTimeout(500);
      await page.locator('li.k-item, span').filter({ hasText: /^Archive$/i }).first().click({ force: true });
      const popupSave2 = page.locator(
        'div[batch-action-form-simple-buttons] span.btn.btn-primary.cursor-pointer'
      ).filter({ hasText: /^Save Changes$/i }).first();
      await popupSave2.waitFor({ state: 'visible', timeout: 10_000 });
      await popupSave2.click({ force: true });
      await page.waitForTimeout(3000);

      // Validate again
      await page.goto(vehiclesUrl);
      await page.waitForTimeout(2000);
      const stillVisible2 = await page.locator('tr').filter({ hasText: cmd.vin }).count();
      if (stillVisible2 > 0) {
        return fail('REMOVE_VEHICLE', `VIN ${cmd.vin} still visible after 2 archive attempts`);
      }
      logger.info(`removeVehicle: VIN ${cmd.vin} confirmed archived on retry`);
    } else {
      logger.info(`removeVehicle: VIN ${cmd.vin} confirmed not in active vehicles list`);
    }

    return ok('REMOVE_VEHICLE', `Vehicle VIN ${cmd.vin} archived (verified).`);
  } catch (err) {
    return fail('REMOVE_VEHICLE', (err as Error).message, err as Error);
  }
}
