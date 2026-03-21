import { Page } from 'playwright';
import { AddLossPayeeCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, todayYYYYMMdd, safeFilenamePart } from './_base';
import { openAdditionalInterestInsert, searchOrCreateHolder, downloadCertificate } from './_holderHelpers';

/**
 * ADD LOSS PAYEE TO VIN#
 * Uses the Additional Interests Insert page (Momentum/Angular UI):
 * 1. Additional Interests tab -> Add New
 * 2. Search/create holder
 * 3. Uncheck "Additional Insured" (checked by default)
 * 4. Check "Loss Payee"
 * 5. Add note/description if any
 * 6. Save
 * 7. Actions -> Send Certificate -> download
 */
export async function addLossPayee(page: Page, cmd: AddLossPayeeCommand): Promise<ActionResult> {
  logger.info(`addLossPayee: VIN=${cmd.vin} holder="${cmd.holder.name}"`);

  try {
    await openAdditionalInterestInsert(page);
    await searchOrCreateHolder(page, cmd.holder);

    // Uncheck "Additional Insured" (checked by default)
    const aiCheckbox = page.getByRole('checkbox', { name: 'Additional Insured' });
    if (await aiCheckbox.isChecked()) {
      await aiCheckbox.uncheck();
      await page.waitForTimeout(300);
    }

    // Check "Loss Payee"
    const lpCheckbox = page.getByRole('checkbox', { name: 'Loss Payee' });
    await lpCheckbox.check();
    await page.waitForTimeout(300);

    // Note / Description of Operations
    if (cmd.holder.note) {
      const descField = page.getByRole('textbox', { name: 'Description of Operations' });
      await descField.waitFor({ state: 'visible', timeout: 10_000 });
      await descField.fill(cmd.holder.note);
    }

    // Save
    const saveBtn = page.locator('button').filter({ hasText: /^Save Changes$/i }).first();
    await saveBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await saveBtn.click({ force: true });
    await waitForSaveConfirmation(page);
    await page.waitForTimeout(2000);

    // Download certificate
    const last4vin = cmd.vin.slice(-4);
    const today = todayYYYYMMdd();
    const filename = `${today} Certificate Holder & LP VIN# ${last4vin} (${safeFilenamePart(cmd.holder.name)}).pdf`;
    const files = await downloadCertificate(page, filename, cmd.holder.name, cmd.holder.note).catch(err => {
      logger.warn(`downloadCertificate not completed: ${(err as Error).message}`);
      return [];
    });

    return ok('ADD_LOSS_PAYEE', `Loss Payee added for VIN ${cmd.vin}`, files);
  } catch (err) {
    return fail('ADD_LOSS_PAYEE', (err as Error).message, err as Error);
  }
}
