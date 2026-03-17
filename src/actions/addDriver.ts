import { Page } from 'playwright';
import { AddDriverCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, buildNowCertsUrl, getInsuredIdFromUrl, buildInsuredUrl } from './_base';

const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

function toFullStateName(abbr: string): string {
  return STATE_NAMES[abbr.toUpperCase()] ?? abbr;
}

async function selectNgSelect(page: Page, index: number, value: string): Promise<void> {
  const fullValue = value.length <= 3 ? toFullStateName(value) : value;
  const selects = page.locator('ng-select');
  if (await selects.count() <= index) return;
  const select = selects.nth(index);
  await select.click({ force: true });
  await page.waitForTimeout(300);
  const input = select.locator('input[aria-autocomplete="list"]').first();
  if (await input.count() > 0) {
    await input.fill(fullValue);
    await page.waitForTimeout(500);
  }
  const option = page.locator('ng-dropdown-panel .ng-option').filter({ hasText: new RegExp(fullValue, 'i') }).first();
  if (await option.count() > 0) {
    await option.click({ force: true });
    await page.waitForTimeout(300);
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
}

/**
 * Fills a Kendo datepicker spinbutton by typing digits only (no slashes).
 * The Kendo widget auto-advances between month/day/year segments.
 * dateStr must be in MM/DD/YYYY format.
 */
async function fillKendoDate(page: Page, locator: ReturnType<Page['locator']>, dateStr: string): Promise<void> {
  const digits = dateStr.replace(/\//g, ''); // "09/13/1985" -> "09131985"
  await locator.click();
  await page.waitForTimeout(200);
  await locator.pressSequentially(digits, { delay: 80 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
}

/**
 * ADD DRIVER
 * Insured Items -> Drivers -> Add New
 */
export async function addDriver(page: Page, cmd: AddDriverCommand): Promise<ActionResult> {
  const { driver } = cmd;
  logger.info(`addDriver: ${driver.firstName} ${driver.lastName}`);

  try {
    // Navigate directly to the Drivers list using the insured ID from the URL
    const insuredId = getInsuredIdFromUrl(page);
    const driversUrl = buildInsuredUrl(insuredId, 'Drivers');
    await page.goto(driversUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Click "+ Add New" to go to the Insert driver page
    const addLink = page.locator('a').filter({ hasText: /\+ Add New/i }).first();
    const href = await addLink.getAttribute('href');
    if (href) {
      const fullUrl = href.startsWith('http') ? href : buildNowCertsUrl(href);
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await addLink.click({ force: true });
    }
    await page.waitForURL('**/AMSINS/Drivers/Insert**', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // ── General section ──────────────────────────────────────────────────
    await page.fill('input[placeholder="First Name"]', driver.firstName);
    await page.fill('input[placeholder="Last Name"]', driver.lastName);

    // Date of Birth – kendo datepicker (spinbutton). Type digits only, no slashes.
    const dobInput = page.locator('kendo-datepicker input').first();
    await fillKendoDate(page, dobInput, driver.dob);

    // ── Additional section ───────────────────────────────────────────────
    await page.fill('input[placeholder="DL Number"]', driver.cdl);

    // DL Status (ng-select index 0) → "Active"
    // DL State  (ng-select index 1) → driver's state (full name)
    await selectNgSelect(page, 0, 'Active');
    await selectNgSelect(page, 1, driver.cdlState);

    // ── Save ─────────────────────────────────────────────────────────────
    // The save button is a <button> element with text "Save Changes"
    const saveBtn = page.locator('button').filter({ hasText: /^Save Changes$/i }).first();
    await saveBtn.click({ force: true });
    await waitForSaveConfirmation(page);

    return ok('ADD_DRIVER', `Driver ${driver.firstName} ${driver.lastName} added.`);
  } catch (err) {
    return fail('ADD_DRIVER', (err as Error).message, err as Error);
  }
}
