import { Page } from 'playwright';
import { AddLossPayeeCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, triggerDownload, todayYYYYMMdd, getInsuredUrl } from './_base';
import { searchOrCreateHolder } from './_holderHelpers';

/**
 * ADD LOSS PAYEE TO VIN#
 * Steps:
 * 1. Insured Items -> Vehicles -> find vehicle by VIN -> Actions -> Lien Holders -> Add
 * 2. Search/create holder
 * 3. Uncheck Additional Insured (if checked), check Loss Payee
 * 4. Select Physical Damage policy
 * 5. Add note (if any)
 * 6. Save
 * 7. Actions -> Lien Holders -> actions -> Send Certificate -> download
 */
export async function addLossPayee(page: Page, cmd: AddLossPayeeCommand): Promise<ActionResult> {
  logger.info(`addLossPayee: VIN=${cmd.vin} holder="${cmd.holder.name}"`);

  try {
    // Navigate directly to the Vehicles page via URL (same pattern as updateVehicleValue)
    await page.goto(getInsuredUrl(page, 'Vehicles'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Find vehicle row by VIN
    const row = page.locator(`tr:has-text("${cmd.vin}"), [data-vin="${cmd.vin}"]`).first();
    await row.locator('text=Actions').click();
    await page.click('text=Lien Holders');

    // Click Add
    await page.locator('button').filter({ hasText: /^Add$/i }).first().click({ force: true });
    await page.waitForLoadState('networkidle');

    // Search/create holder
    await searchOrCreateHolder(page, cmd.holder);

    // Uncheck Additional Insured (if checked)
    // TODO: Confirm checkbox selectors
    const aiCheckbox = page.locator('input[name="AdditionalInsured"], input[value="AI"]');
    if (await aiCheckbox.isChecked()) {
      await aiCheckbox.uncheck();
    }

    // Check Loss Payee
    await page.check('input[name="LossPayee"], input[value="LP"]');

    // Select policy (defaults to Physical Damage)
    const policyLabel = cmd.policyLabel ?? 'Physical Damage';
    const policySelect = page.locator('select[name="PolicyId"], [data-field="policies"]');
    await policySelect.selectOption({ label: policyLabel });

    // Note
    if (cmd.holder.note) {
      await page.fill('textarea[name="DescriptionOfOperations"], #descOfOps', cmd.holder.note);
    }

    await page.click('button[type="submit"], button:text("Save")');
    await waitForSaveConfirmation(page);

    // Download certificate
    const last4vin = cmd.vin.slice(-4);
    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder & LP VIN# ${last4vin} ${cmd.holder.name}.pdf`;

    // Navigate: Actions -> Lien Holders -> actions -> Send Certificate
    const vehicleRow2 = page.locator(`tr:has-text("${cmd.vin}"), [data-vin="${cmd.vin}"]`).first();
    await vehicleRow2.locator('text=Actions').click();
    await page.click('text=Lien Holders');

    // Find the holder row and Send Certificate
    const holderRow = page.locator(`tr:has-text("${cmd.holder.name}")`).first();
    await holderRow.locator('text=actions, text=Actions').click();
    await page.click('text=Send Certificate');
    await page.waitForLoadState('networkidle');

    // Add drivers + only relevant vehicles
    // TODO: Logic to select only the vehicles related to this LP
    const selectAllDrivers = page.locator('text=Select All').first();
    if (await selectAllDrivers.isVisible({ timeout: 2000 })) {
      await selectAllDrivers.click();
    }
    // Select only the vehicle with this VIN
    await page.check(`input[data-vin="${cmd.vin}"], tr:has-text("${cmd.vin}") input[type="checkbox"]`).catch(() => {
      logger.warn(`Could not select specific VIN ${cmd.vin}, selecting all`);
    });

    const filePath = await triggerDownload(
      page,
      async () => {
        await page.click('button:text("Download"), button:text("Generate")');
      },
      filename
    );

    return ok('ADD_LOSS_PAYEE', `Loss Payee added for VIN ${cmd.vin}`, [filePath]);
  } catch (err) {
    return fail('ADD_LOSS_PAYEE', (err as Error).message, err as Error);
  }
}
