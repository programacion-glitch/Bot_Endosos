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
  const arrow = page.locator(COVERAGES_ARROW).first();

  for (let attempt = 0; attempt < 3; attempt++) {
    // Open the dropdown arrow
    await arrow.click({ force: true }).catch(async () => {
      await arrow.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(1200 + attempt * 500);

    // Use pure DOM evaluate — isVisible() is unreliable for RadComboBox items.
    const result = await page.evaluate((name: string) => {
      const doc = (globalThis as any).document;
      const items: any[] = Array.from(
        doc.querySelectorAll(
          '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_DropDown li'
        )
      );
      const lower = name.toLowerCase();
      // Prefer exact match (e.g. "Physical Damage" should NOT match "Owned Trailer Physical Damage")
      // Strip leading/trailing whitespace from textContent for comparison.
      let target = items.find((li: any) => (li.textContent || '').trim().toLowerCase() === lower);
      // Fallback: startsWith match (handles variations like "Physical Damage Coverage")
      if (!target) {
        target = items.find((li: any) => (li.textContent || '').trim().toLowerCase().startsWith(lower));
      }
      if (!target) return { found: false, alreadyChecked: false, texts: items.map((li: any) => (li.textContent || '').trim()) };
      const cb: any = target.querySelector('input[type="checkbox"]');
      const wasChecked = !!(cb && cb.checked);
      if (cb && wasChecked) {
        // Already checked — uncheck first to force re-render of controls (will be re-checked below)
        cb.click();
      } else if (cb && !wasChecked) {
        // Not checked — check it to activate the coverage section controls
        cb.click();
      }
      return { found: true, alreadyChecked: wasChecked };
    }, sectionName);

    if (result.found) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(300);

      if (result.alreadyChecked) {
        // Was already checked — we unchecked it above. Refresh, then re-check to force control render.
        logger.info(`Coverage section "${sectionName}" was already checked — toggling off/on to force control render`);
        await refreshCoverageSections(page);

        // Re-open dropdown and check again
        await arrow.click({ force: true }).catch(async () => {
          await arrow.evaluate((el: any) => el.click());
        });
        await page.waitForTimeout(1200);
        await page.evaluate((name: string) => {
          const doc = (globalThis as any).document;
          const items: any[] = Array.from(
            doc.querySelectorAll(
              '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_DropDown li'
            )
          );
          const lower = name.toLowerCase();
          // Prefer exact match, fallback to startsWith
          let target = items.find((li: any) => (li.textContent || '').trim().toLowerCase() === lower);
          if (!target) {
            target = items.find((li: any) => (li.textContent || '').trim().toLowerCase().startsWith(lower));
          }
          if (target) {
            const cb: any = target.querySelector('input[type="checkbox"]');
            if (cb && !cb.checked) cb.click();
          }
        }, sectionName);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
      } else {
        // Was NOT checked — we checked it above. Refresh to load the coverage controls.
        logger.info(`Coverage section "${sectionName}" newly checked — refreshing to load controls`);
      }

      logger.info(`Coverage section "${sectionName}" selected`);
      return;
    }

    // Items not found — close dropdown and retry
    logger.warn(`Coverage section "${sectionName}" not found on attempt ${attempt + 1}. Available: ${(result as any).texts?.join(' | ')}`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }

  throw new Error(`Coverage section not found after 3 attempts: ${sectionName}`);
}

export async function refreshCoverageSections(page: Page): Promise<void> {
  await page.locator(COVERAGES_REFRESH).evaluate((el: any) => el.click());
  await page.waitForTimeout(4000);
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
  // First try: wait for the control to appear in the DOM (up to 10s)
  const appeared = await waitForControlAttached(page, selector, 10_000);
  if (appeared) return;

  // Retry: re-open coverages view and wait again
  for (let attempt = 0; attempt < 3; attempt++) {
    logger.info(`ensureControlExists: "${selector}" not found, retrying (${attempt + 1}/3)...`);
    await openCoveragesView(page);
    await page.waitForTimeout(2000 + attempt * 1000);

    const input = page.locator(selector).first();
    if (await input.count() > 0) return;
  }

  throw new Error(`Control not found: ${selector}`);
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

/**
 * Opens the master certificate edit page and clicks Update to save.
 * Supports both new full-page navigation and legacy rwPopup iframe.
 */
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
  await page.locator('.k-animation-container .k-item, .k-menu-popup .k-item').filter({ hasText: /^Edit$/i }).first().click();

  const UPDATE_BTN = '#ctl00_ContentPlaceHolder1_btnUpdate_input';
  let editContext: Page | ReturnType<typeof page.frame> = page;

  // Quick check: full-page navigation?
  await page.waitForURL('**/Certificates/Edit.aspx**', { timeout: 5_000 }).catch(() => {});

  if (page.url().includes('/Certificates/Edit.aspx')) {
    logger.info('saveMaster: navigated to edit page');
    await page.waitForTimeout(3000);
  } else {
    // Modal popup — wait for rwPopup iframe with retries
    let found = false;
    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      await page.waitForTimeout(2000 + attempt * 1000);
      const frame = page.frame({ name: 'rwPopup' });
      if (frame) {
        const hasBtn = await frame.locator(UPDATE_BTN).count().catch(() => 0);
        if (hasBtn > 0) { editContext = frame; found = true; break; }
      }
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const hasBtn = await f.locator(UPDATE_BTN).count().catch(() => 0);
        if (hasBtn > 0) { editContext = f; found = true; break; }
      }
      if (!found) logger.info(`saveMaster: modal not ready (attempt ${attempt + 1}/6)`);
    }
    if (!found) throw new Error('Master certificate edit modal did not load after 6 attempts');
  }

  const updateBtn = editContext.locator(UPDATE_BTN).first();
  await updateBtn.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  await updateBtn.scrollIntoViewIfNeeded().catch(() => {});
  await updateBtn.evaluate((el: any) => el.click());
  await page.waitForTimeout(5000);
}
