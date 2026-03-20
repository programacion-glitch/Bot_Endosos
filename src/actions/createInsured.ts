import { Page } from 'playwright';
import { CreateInsuredCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, buildNowCertsUrl, STATE_NAMES, toFullStateName } from './_base';

/**
 * CREATE INSURED
 * Navigates to /AMSINS/Insureds/Insert and fills the full form.
 *
 * CONFIRMED SELECTORS (verified via live inspection):
 *  - Name:          input[placeholder="Name"]  + following checkbox
 *  - DBA:           input[placeholder="DBA"]   + following checkbox
 *  - Insured ID:    input[placeholder="Insured ID"]
 *  - Customer ID:   input[placeholder="Customer ID"]
 *  - Address:       input[placeholder="Address Line 1"]
 *  - City:          input[placeholder="City"]
 *  - Zip:           input[placeholder="Zip/Postal Code"]
 *  - State:         state-selector ng-select  (ng-select, NOT kendo)
 *                   → options are FULL state names ("Texas", not "TX")
 *  - First Name:    input[placeholder="First Name"]  (nth for multiple rows)
 *  - Last Name:     input[placeholder="Last Name"]   (nth)
 *  - DOB:           ncm-datepicker[formcontrolname="birthday"] input.k-input (Kendo segment)
 *  - Driver CB:     input[formcontrolname="isDriver"]  (nth)
 *  - DL Number:     input[placeholder="DL Number"]    (nth, appears after Driver CB)
 *  - DL State:      state-selector[formcontrolname="dlState"] ng-select  (nth)
 *  - Add row (+):   span[ncm-add-item]  (NOT a <button>)
 *  - Phone:         insureds-panel-contacts kendo-maskedtextbox input.k-textbox  (first)
 *  - Primary Email: trucking-companies-redirect-popover input[type="text"]  OR  input[placeholder="Primary Email"]
 *  - Save:          button:has-text("Save Changes")
 */

/** Select from an ng-select (state-selector) component — uses full state name */
async function selectNgSelect(
  page: Page,
  containerLocator: string,
  value: string,
  rowIndex = 0
): Promise<void> {
  const containers = page.locator(containerLocator);
  const count = await containers.count();
  if (count === 0) {
    logger.warn(`selectNgSelect: "${containerLocator}" not found`);
    return;
  }
  const idx = Math.min(rowIndex, count - 1);
  const container = containers.nth(idx);

  // Use full state name for abbreviations
  const searchValue = value.length <= 3 ? (toFullStateName(value)) : value;

  await container.click();

  // Wait for dropdown panel to be visible (options load within ~200ms of click)
  await page.locator('ng-dropdown-panel').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(200);

  // Type to filter options
  const searchInput = container.locator('input[aria-autocomplete="list"]');
  if (await searchInput.count() > 0) {
    await searchInput.fill(searchValue);
    await page.waitForTimeout(500);
  }

  // Exact match first
  const exactOpt = page.locator('ng-dropdown-panel .ng-option')
    .filter({ hasText: new RegExp(`^${searchValue}$`, 'i') }).first();
  if (await exactOpt.count() > 0) {
    await exactOpt.click();
    await page.waitForTimeout(200);
    return;
  }

  // Partial match fallback
  const partialOpt = page.locator('ng-dropdown-panel .ng-option')
    .filter({ hasText: new RegExp(searchValue, 'i') }).first();
  if (await partialOpt.count() > 0) {
    await partialOpt.click();
    await page.waitForTimeout(200);
    return;
  }

  await page.keyboard.press('Escape');
  logger.warn(`selectNgSelect: no option found for "${searchValue}"`);
}

/**
 * Fill Kendo DatePicker (segment-based).
 * dateStr must be MM/DD/YYYY.
 */
async function fillKendoDate(
  page: Page,
  containerSelector: string,
  rowIndex: number,
  dateStr: string
): Promise<void> {
  const [month, day, year] = dateStr.split('/');
  const containers = page.locator(containerSelector);
  if (await containers.count() === 0) {
    logger.warn(`fillKendoDate: "${containerSelector}" not found`);
    return;
  }
  const input = containers.nth(rowIndex).locator('input.k-input');
  if (await input.count() === 0) {
    logger.warn(`fillKendoDate: k-input inside ${containerSelector} not found`);
    return;
  }
  await input.click();
  await page.waitForTimeout(200);
  await input.type(month, { delay: 100 });
  await input.type(day,   { delay: 100 });
  await input.type(year,  { delay:  50 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
}

export async function createInsured(
  page: Page,
  cmd: CreateInsuredCommand
): Promise<ActionResult> {
  logger.info(`createInsured: "${cmd.name}" USDOT:${cmd.usdot}`);

  try {
    // Navigate to the insert page — may need multiple attempts if session redirects
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto(buildNowCertsUrl('/AMSINS/Insureds/Insert'), {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      // Wait for Angular router to settle (it may redirect to old ASPX first)
      await page.waitForTimeout(3000);
      if (page.url().includes('AMSINS/Insureds/Insert')) break;
      logger.warn(`createInsured: redirect on attempt ${attempt + 1}, URL: ${page.url()}`);
    }
    // Wait up to 20s for Angular to render the form
    await page.waitForSelector('input[placeholder="Name"]', { timeout: 20_000 });
    await page.waitForTimeout(1500);

    // ── GENERAL ──────────────────────────────────────────────────────────────

    await page.fill('input[placeholder="Name"]', cmd.name);
    // Checkbox is the first checkbox following the Name input
    await page.locator('input[placeholder="Name"]')
      .locator('xpath=following::input[@type="checkbox"][1]')
      .check()
      .catch(() => logger.warn('Name checkbox not found'));

    if (cmd.dba) {
      await page.fill('input[placeholder="DBA"]', cmd.dba);
      await page.locator('input[placeholder="DBA"]')
        .locator('xpath=following::input[@type="checkbox"][1]')
        .check()
        .catch(() => logger.warn('DBA checkbox not found'));
    }

    await page.fill('input[placeholder="Insured ID"]',  cmd.usdot);
    await page.fill('input[placeholder="Customer ID"]', cmd.usdot);

    // ── MAILING ADDRESS ───────────────────────────────────────────────────────

    // Address comes in as "123 Main St, Dallas, TX, 75001"
    const addrParts = cmd.address.split(',').map(s => s.trim());
    await page.fill('input[placeholder="Address Line 1"]', addrParts[0] ?? '');
    await page.fill('input[placeholder="City"]',           addrParts[1] ?? '');
    const stateAbbr = addrParts[2]?.trim() ?? '';
    const zip       = addrParts[3]?.trim() ?? '';

    await page.fill('input[placeholder="Zip/Postal Code"]', zip);

    if (stateAbbr) {
      await selectNgSelect(page, 'state-selector ng-select', stateAbbr);
    }

    // ── PRINCIPALS / CO-INSUREDS (Drivers) ───────────────────────────────────

    for (let i = 0; i < cmd.drivers.length; i++) {
      const d = cmd.drivers[i];

      if (i > 0) {
        // Add a new row — the "+" is a span[title="Add"] next to DL State (NOT a <button>)
        // It is always the FIRST visible span[title="Add"] on the page
        const addIcon = page.locator('span[title="Add"]').first();
        if (await addIcon.count() > 0) {
          await addIcon.scrollIntoViewIfNeeded().catch(() => {});
          await addIcon.click({ force: true });
        } else {
          logger.warn(`Could not find add-row button for driver ${i + 1}`);
        }
        await page.waitForTimeout(700);
      }

      const firstNames = page.locator('input[placeholder="First Name"]');
      const lastNames  = page.locator('input[placeholder="Last Name"]');
      const rowCount   = await firstNames.count();
      const rowIdx     = Math.min(i, rowCount - 1);

      await firstNames.nth(rowIdx).fill(d.firstName);
      await lastNames.nth(rowIdx).fill(d.lastName);

      // DOB (fill before checking Driver checkbox — it's always visible)
      if (d.dob) {
        await fillKendoDate(
          page,
          'ncm-datepicker[formcontrolname="birthday"]',
          rowIdx,
          d.dob
        );
      }

      // Driver checkbox
      const driverCbs = page.locator('input[formcontrolname="isDriver"]');
      if (await driverCbs.count() > rowIdx) {
        const isChecked = await driverCbs.nth(rowIdx).isChecked();
        if (!isChecked) await driverCbs.nth(rowIdx).check();
        await page.waitForTimeout(700); // wait for DL Number / DL State to appear
      }

      // DL Number (appears after Driver checkbox)
      if (d.cdl) {
        const dlInputs = page.locator('input[placeholder="DL Number"]');
        if (await dlInputs.count() > rowIdx) {
          await dlInputs.nth(rowIdx).fill(d.cdl);
        }
      }

      // DL State (state-selector with formcontrolname="dlState")
      if (d.cdlState) {
        await selectNgSelect(
          page,
          'state-selector[formcontrolname="dlState"] ng-select',
          d.cdlState,
          rowIdx
        );
      }
    }

    // ── CONTACTS ──────────────────────────────────────────────────────────────

    // Scroll contacts section into view
    await page.locator('insureds-panel-contacts').scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);

    // Phone: kendo-maskedtextbox inside insureds-panel-contacts
    // Input has no placeholder — identified by position (first k-textbox in contacts panel)
    if (cmd.phone) {
      const phoneInput = page.locator('insureds-panel-contacts kendo-maskedtextbox input.k-textbox').first();
      if (await phoneInput.count() > 0) {
        await phoneInput.click();
        await page.waitForTimeout(200);
        // Type digit-by-digit for masked input
        for (const ch of cmd.phone.replace(/\D/g, '')) {
          await phoneInput.press(ch);
          await page.waitForTimeout(20);
        }
      } else {
        logger.warn('Phone input not found');
      }
    }

    // Primary Email — placeholder selector is reliable
    if (cmd.email) {
      const emailInput = page.locator('input[placeholder="Primary Email"]').first();
      if (await emailInput.count() > 0) {
        await emailInput.fill(cmd.email);
      } else {
        // Fallback: trucking-companies-redirect-popover wraps the email input
        // Find the one inside insureds-panel-contacts
        const emailFallback = page.locator('insureds-panel-contacts trucking-companies-redirect-popover input[type="text"]').first();
        if (await emailFallback.count() > 0) {
          await emailFallback.fill(cmd.email);
        } else {
          logger.warn('Primary Email input not found');
        }
      }
    }

    // ── SAVE ──────────────────────────────────────────────────────────────────

    const saveBtn = page.locator('span.btn-loading:has-text("Save Changes"), [role="button"]:has-text("Save Changes")').first();
    await saveBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await saveBtn.click();
    await waitForSaveConfirmation(page);

    return ok('CREATE_INSURED', `Client "${cmd.name}" created successfully.`);
  } catch (err) {
    return fail('CREATE_INSURED', (err as Error).message, err as Error);
  }
}
