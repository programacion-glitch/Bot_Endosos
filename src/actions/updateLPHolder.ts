import { Page } from 'playwright';
import { UpdateLPHolderCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, triggerDownload, todayYYYYMMdd } from './_base';

/**
 * UPDATE LP HOLDER NAME/ADDRESS FOR VIN#
 */
export async function updateLPHolder(
  page: Page,
  cmd: UpdateLPHolderCommand
): Promise<ActionResult> {
  logger.info(`updateLPHolder: VIN=${cmd.vin} "${cmd.holderName}" -> "${cmd.updateTo}"`);

  try {
    // Navigate to vehicle
    await page.click('text=Insured Items, [data-menu="insured-items"]');
    await page.click('text=Vehicles');
    await page.waitForLoadState('networkidle');

    const row = page.locator(`tr:has-text("${cmd.vin}"), [data-vin="${cmd.vin}"]`).first();
    await row.locator('text=Actions').click();
    await page.click('text=Lien Holders');

    // Find holder row and edit
    const holderRow = page.locator(`tr:has-text("${cmd.holderName}")`).first();
    await holderRow.locator('text=Actions').click();
    await page.click('text=Edit');
    await page.waitForLoadState('networkidle');

    // Modify value
    const nameField = page.locator('input[name="CompanyName"]').first();
    await nameField.fill(cmd.updateTo);

    if (cmd.note) {
      await page.fill('textarea[name="DescriptionOfOperations"], #descOfOps', cmd.note);
    }

    await page.click('button[type="submit"], button:text("Save")');
    await waitForSaveConfirmation(page);

    // Download certificate
    const last4vin = cmd.vin.slice(-4);
    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder & LP VIN# ${last4vin} ${cmd.updateTo}.pdf`;

    // Send Certificate via Lien Holders
    const row2 = page.locator(`tr:has-text("${cmd.vin}"), [data-vin="${cmd.vin}"]`).first();
    await row2.locator('text=Actions').click();
    await page.click('text=Lien Holders');
    const holderRow2 = page.locator(`tr:has-text("${cmd.updateTo}")`).first();
    await holderRow2.locator('text=Actions').click();
    await page.click('text=Send Certificate');
    await page.waitForLoadState('networkidle');

    const selectAllDrivers = page.locator('text=Select All').first();
    if (await selectAllDrivers.isVisible({ timeout: 2000 })) {
      await selectAllDrivers.click();
    }

    const filePath = await triggerDownload(
      page,
      async () => { await page.click('button:text("Download"), button:text("Generate")'); },
      filename
    );

    return ok('UPDATE_LP_HOLDER', `LP Holder updated for VIN ${cmd.vin}`, [filePath]);
  } catch (err) {
    return fail('UPDATE_LP_HOLDER', (err as Error).message, err as Error);
  }
}
