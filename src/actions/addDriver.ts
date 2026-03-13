import { Page } from 'playwright';
import { AddDriverCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, buildNowCertsUrl } from './_base';

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

async function fillKendoDateByIndex(page: Page, index: number, dateStr: string): Promise<void> {
  const inputs = page.locator('input.k-input');
  if (await inputs.count() <= index) return;
  const input = inputs.nth(index);
  const [mm, dd, yyyy] = dateStr.split('/');
  await input.click();
  await page.waitForTimeout(200);
  await input.fill('');
  await input.type(mm, { delay: 80 });
  await input.type(dd, { delay: 80 });
  await input.type(yyyy, { delay: 50 });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
}

/**
 * ADD DRIVER
 * Insured Items -> Drivers -> Add New
 */
export async function addDriver(page: Page, cmd: AddDriverCommand): Promise<ActionResult> {
  const { driver } = cmd;
  logger.info(`addDriver: ${driver.firstName} ${driver.lastName}`);

  try {
    // Confirmed live flow:
    // insured -> Insured Items -> Drivers -> + Add New -> /AMSINS/Drivers/Insert
    await page.locator('button').filter({ hasText: /^Insured Items$/i }).first().click();
    await page.waitForTimeout(500);
    await page.locator('a[href*="/Drivers"]').first().click();
    await page.waitForURL('**/AMSINS/Insureds/Details/*/Drivers', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const addLink = page.locator('a.action-insert').filter({ hasText: /\+ Add New/i }).first();
    const href = await addLink.getAttribute('href');
    if (href) {
      const fullUrl = href.startsWith('http') ? href : buildNowCertsUrl(href);
      await page.goto(fullUrl, { waitUntil: 'domcontentloaded' });
    } else {
      await addLink.click({ force: true });
    }
    await page.waitForURL('**/AMSINS/Drivers/Insert**', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Confirmed fields on live page
    await page.fill('input[placeholder="First Name"]', driver.firstName);
    await page.fill('input[placeholder="Last Name"]', driver.lastName);
    await fillKendoDateByIndex(page, 0, driver.dob);
    await page.fill('input[placeholder="DL Number"]', driver.cdl);
    // First ng-select after DL Number is DL State on the live insert page
    await selectNgSelect(page, 0, driver.cdlState);

    await page.locator('span.btn.btn-primary.cursor-pointer').filter({ hasText: /^Save Changes$/i }).first().click({ force: true });
    await waitForSaveConfirmation(page);

    return ok('ADD_DRIVER', `Driver ${driver.firstName} ${driver.lastName} added.`);
  } catch (err) {
    return fail('ADD_DRIVER', (err as Error).message, err as Error);
  }
}
