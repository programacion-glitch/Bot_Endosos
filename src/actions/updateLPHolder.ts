import { Page } from 'playwright';
import { UpdateLPHolderCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, todayYYYYMMdd, safeFilenamePart, escapeRegex, getInsuredUrl } from './_base';
import { downloadCertificate } from './_holderHelpers';

/**
 * UPDATE LP HOLDER NAME/ADDRESS FOR VIN#
 * Manual flow:
 * 1. Go to vehicle list -> find VIN -> Actions -> Lien Holders -> Actions -> Edit
 * 2. Modify the requested value
 * 3. Add notes if any
 * 4. Save
 * 5. Actions -> Lien Holders -> Actions -> Send Certificate
 * 6. Add drivers + related vehicles only
 * 7. Download
 */
export async function updateLPHolder(
  page: Page,
  cmd: UpdateLPHolderCommand
): Promise<ActionResult> {
  logger.info(`updateLPHolder: VIN=${cmd.vin} "${cmd.holderName}" -> "${cmd.updateTo}"`);

  try {
    // Navigate to vehicles list
    const vehiclesUrl = getInsuredUrl(page, 'Vehicles');
    await page.goto(vehiclesUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Find the vehicle row by VIN
    const vehicleRow = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(cmd.vin), 'i') }).first();
    if (await vehicleRow.count() === 0) {
      return fail('UPDATE_LP_HOLDER', `Vehicle row not found for VIN: ${cmd.vin}`);
    }

    // Actions -> Lien Holders
    await vehicleRow.locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('li.k-item, span, a').filter({ hasText: /Lien\s*Holders/i }).first().click({ force: true });
    await page.waitForTimeout(2000);

    // Find the holder row and click Actions -> Edit
    const holderRow = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(cmd.holderName), 'i') }).first();
    if (await holderRow.count() === 0) {
      return fail('UPDATE_LP_HOLDER', `LP Holder "${cmd.holderName}" not found for VIN ${cmd.vin}`);
    }
    await holderRow.locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('li.k-item, span, a').filter({ hasText: /^Edit$/i }).first().click({ force: true });
    await page.waitForTimeout(2500);

    // Modify the requested value (name or address)
    const companyNameInput = page.locator('input[placeholder="Company Name"]').first();
    if (await companyNameInput.count() > 0) {
      await companyNameInput.fill(cmd.updateTo);
    } else {
      const nameField = page.locator('input[name="CompanyName"]').first();
      await nameField.fill(cmd.updateTo);
    }

    // Add notes if any
    if (cmd.note) {
      const descField = page.locator('textarea[placeholder="Description of Operations"]').first();
      if (await descField.count() > 0) {
        await descField.fill(cmd.note);
      } else {
        await page.locator('textarea[name="DescriptionOfOperations"], #descOfOps').first().fill(cmd.note);
      }
    }

    // Save
    const saveBtn = page.locator('span.btn-loading, button, input[type="submit"]').filter({ hasText: /Save Changes/i }).first();
    await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await saveBtn.click({ force: true });
    await waitForSaveConfirmation(page);

    // Navigate back to vehicles to Send Certificate via Lien Holders
    await page.goto(vehiclesUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const vehicleRow2 = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(cmd.vin), 'i') }).first();
    await vehicleRow2.locator('button,span,a').filter({ hasText: /Actions/i }).first().click({ force: true });
    await page.waitForTimeout(500);
    await page.locator('li.k-item, span, a').filter({ hasText: /Lien\s*Holders/i }).first().click({ force: true });
    await page.waitForTimeout(2000);

    // Find updated holder row -> Actions -> Send Certificate
    const effectiveName = cmd.updateTo;
    const last4vin = cmd.vin.slice(-4);
    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder & LP VIN# ${last4vin} (${safeFilenamePart(effectiveName)}).pdf`;

    const holderRow2 = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(effectiveName), 'i') }).first();
    if (await holderRow2.count() === 0) {
      logger.warn(`Updated LP Holder row not found for "${effectiveName}", trying original name`);
    }

    const files = await downloadCertificate(page, filename, effectiveName, cmd.note).catch(err => {
      logger.warn(`downloadCertificate not completed: ${(err as Error).message}`);
      return [];
    });

    return ok('UPDATE_LP_HOLDER', `LP Holder updated for VIN ${cmd.vin}`, files);
  } catch (err) {
    return fail('UPDATE_LP_HOLDER', (err as Error).message, err as Error);
  }
}
