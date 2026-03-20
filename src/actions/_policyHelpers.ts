/**
 * Shared policy-level helpers extracted from addPolicy.ts and consolidated
 * from updateLimitDeductible.ts / updatePolicyNumber.ts.
 */
import { Page } from 'playwright';
import { logger } from '../utils/logger';
import { escapeRegex, toDigits, buildNowCertsUrl } from './_base';

/* ------------------------------------------------------------------ */
/*  Selector constants                                                 */
/* ------------------------------------------------------------------ */

export const COVERAGES_VIEW = 'div.ibox:has(h4:text-is("Coverages")) span.label.state';
export const COVERAGES_ARROW = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_Arrow';
export const COVERAGES_REFRESH = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_btnRefreshSections';
export const COVERAGES_DROPDOWN = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_DropDown li';
export const AL_SECTION_CHECKBOX = '[id$="automobileLiability_cbAutomobileLiability"]';

/* ------------------------------------------------------------------ */
/*  RadComboBox helper                                                 */
/* ------------------------------------------------------------------ */

export async function selectRadComboByText(page: Page, arrowSelector: string, text: string): Promise<boolean> {
  const arrow = page.locator(arrowSelector).first();
  if (await arrow.count() === 0) return false;

  for (let attempt = 0; attempt < 3; attempt++) {
    await arrow.click({ force: true }).catch(async () => {
      await arrow.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(1000); // Allow combo list to render

    const exact = page.locator('li.rcbItem, li.rcbHovered, .rcbList li').filter({
      hasText: new RegExp(`^${escapeRegex(text)}$`, 'i'),
    }).first();
    const partial = page.locator('li.rcbItem, li.rcbHovered, .rcbList li').filter({
      hasText: new RegExp(escapeRegex(text), 'i'),
    }).first();

    if (await exact.count() > 0 && await exact.isVisible().catch(() => false)) {
      await exact.click({ force: true }).catch(async () => {
        await exact.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(500);
      return true;
    }

    if (await partial.count() > 0 && await partial.isVisible().catch(() => false)) {
      await partial.click({ force: true }).catch(async () => {
        await partial.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(500);
      return true;
    }

    // Attempt failed, close it cleanly for next attempt
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }

  return false;
}

/* ------------------------------------------------------------------ */
/*  Coverages helpers                                                  */
/* ------------------------------------------------------------------ */

export async function openCoveragesView(page: Page): Promise<void> {
  const view = page.locator(COVERAGES_VIEW).filter({ hasText: /^View$/i }).first();
  if (await view.count() > 0) {
    await view.click({ force: true }).catch(async () => {
      await view.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(1500);
  }
}

export async function selectCoverageSection(page: Page, sectionName: string): Promise<void> {
  // Open the dropdown arrow
  const arrow = page.locator(COVERAGES_ARROW).first();
  await arrow.click({ force: true }).catch(async () => {
    await arrow.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(1200);

  // Use pure DOM evaluate — isVisible() is unreliable for RadComboBox items.
  // Find the li whose text starts with sectionName and ensure its checkbox is checked.
  const result = await page.evaluate((name: string) => {
    const doc = (globalThis as any).document;
    const items: any[] = Array.from(
      doc.querySelectorAll(
        '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_DropDown li'
      )
    );
    const lower = name.toLowerCase();
    const target = items.find((li: any) => {
      const t = (li.textContent || '').toLowerCase();
      return t.startsWith(lower) || t.includes(lower);
    });
    if (!target) return { found: false, texts: items.map((li: any) => (li.textContent || '').trim()) };
    const cb: any = target.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
    return { found: true, alreadyChecked: !!(cb && cb.checked) };
  }, sectionName);

  if (!result.found) {
    logger.warn(`Coverage section not found: ${sectionName}. Available: ${(result as any).texts?.join(' | ')}`);
    // Close dropdown and throw
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    throw new Error(`Coverage section not found: ${sectionName}`);
  }

  logger.info(`Coverage section "${sectionName}" selected (alreadyChecked=${(result as any).alreadyChecked})`);

  // Close the dropdown
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

export async function refreshCoverageSections(page: Page): Promise<void> {
  await page.locator(COVERAGES_REFRESH).evaluate((el: any) => el.click());
  await page.waitForTimeout(2500);
}

/* ------------------------------------------------------------------ */
/*  Control helpers                                                    */
/* ------------------------------------------------------------------ */

export async function waitForControlAttached(page: Page, selector: string, timeout = 10000): Promise<boolean> {
  return await page.waitForFunction(
    (sel) => {
      const doc = (globalThis as any).document;
      return !!doc?.querySelector?.(sel);
    },
    selector,
    { timeout }
  ).then(() => true).catch(() => false);
}

export async function ensureControlExists(page: Page, selector: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const input = page.locator(selector).first();
    if (await input.count() > 0) {
      return;
    }

    await openCoveragesView(page);
    await page.waitForTimeout(900);
  }

  const input = page.locator(selector).first();
  if (await input.count() === 0) {
    throw new Error(`Control not found: ${selector}`);
  }
}

export async function setCheckboxById(page: Page, selector: string, checked: boolean): Promise<void> {
  await ensureControlExists(page, selector);
  const input = page.locator(selector).first();

  const current = await input.isChecked().catch(() => false);
  if (current === checked) return;

  if (selector.startsWith('#')) {
    const label = page.locator(`label[for="${selector.slice(1)}"]`).first();
    if (await label.count() > 0 && await label.isVisible().catch(() => false)) {
      await label.click({ force: true }).catch(async () => {
        await label.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(200);
      return;
    }
  }

  await input.evaluate((el: any) => el.click());
  await page.waitForTimeout(200);
}

export async function fillCoverageText(page: Page, selector: string, value?: string): Promise<void> {
  if (!value) return;
  await ensureControlExists(page, selector);
  const input = page.locator(selector).first();
  // If the value has digits, format as number; otherwise keep as text (e.g. "Included")
  const digits = toDigits(value);
  const formatted = digits ? Number(digits).toLocaleString('en-US') : value.trim();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(formatted);
  } else {
    await input.evaluate((el: any, nextValue: string) => {
      el.value = nextValue;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, formatted);
  }
  await page.waitForTimeout(150);
}

/* ------------------------------------------------------------------ */
/*  Automobile Liability coverage enabler                              */
/* ------------------------------------------------------------------ */

export async function enableAutomobileLiabilityCoverage(page: Page): Promise<void> {
  const alreadyAttached = await waitForControlAttached(page, AL_SECTION_CHECKBOX, 4000);

  if (!alreadyAttached) {
    await page.locator(COVERAGES_ARROW).click({ force: true }).catch(async () => {
      await page.locator(COVERAGES_ARROW).evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(500);

    const row = page.locator(`${COVERAGES_DROPDOWN}`).filter({ hasText: /^Automobile Liability -/i }).first();
    await row.locator('input[type="checkbox"]').evaluate((el: any) => el.click());
    await page.waitForTimeout(500);

    await page.locator(COVERAGES_ARROW).click({ force: true }).catch(async () => {
      await page.locator(COVERAGES_ARROW).evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(300);
    await page.locator(COVERAGES_REFRESH).evaluate((el: any) => el.click());
    await page.waitForTimeout(2500);
  }

  const attached = await waitForControlAttached(page, AL_SECTION_CHECKBOX, 10000);
  if (!attached) {
    throw new Error('Automobile Liability section did not appear after coverage refresh');
  }

  const autoSection = page.locator(AL_SECTION_CHECKBOX).first();
  await autoSection.evaluate((el: any) => el.click());
  await page.waitForTimeout(1200);
}

/* ------------------------------------------------------------------ */
/*  Policy navigation & master certificate helpers                     */
/* ------------------------------------------------------------------ */

export async function resolvePolicyEditUrl(page: Page, insuredId: string, policyLabel: string): Promise<string> {
  const policiesUrl = buildNowCertsUrl(`/AMSINS/Insureds/Details/${insuredId}/Policies`);
  await page.goto(policiesUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const row = page.locator('table tbody tr, [role="row"]')
    .filter({ hasText: new RegExp(escapeRegex(policyLabel), 'i') })
    .first();
  if (await row.count() === 0) {
    throw new Error(`Policy row not found for ${policyLabel}`);
  }

  const link = row.locator('a[href*="/AMSINS/Policies/Details/"]').first();
  const href = await link.getAttribute('href');
  if (!href) {
    throw new Error(`Policy details link not found for ${policyLabel}`);
  }

  const match = href.match(/\/AMSINS\/Policies\/Details\/([^/]+)/i);
  if (!match?.[1]) {
    throw new Error(`Policy id not found in link: ${href}`);
  }

  return buildNowCertsUrl(`/Policies/Edit.aspx?Id=${match[1]}`);
}

export async function saveMaster(page: Page, strict = false): Promise<void> {
  const certRows = page.locator('table tbody tr').filter({
    has: page.locator('button, a, span').filter({ hasText: /Actions/i }),
  });
  const count = await certRows.count();
  if (strict && count !== 1) {
    throw new Error(`Expected exactly 1 master certificate row, found ${count}`);
  }
  if (count === 0) {
    logger.info('No master certificate found - skipping');
    return;
  }

  const row = certRows.first();
  await row.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  await page.locator('li, a, span').filter({ hasText: /^Edit$/i }).first().click({ force: true });
  await page.waitForTimeout(3000);
  const frame = page.frame({ name: 'rwPopup' });
  if (!frame) {
    throw new Error('Master certificate edit popup did not load');
  }

  await frame.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').click({ force: true }).catch(async () => {
    await frame.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(5000);
}
