/**
 * Shared helpers for Additional Interests / Holder operations.
 * Reused by addAdditionalInsured, addWaiverSubrogation, addNoteToHolder, addLossPayee, etc.
 */
import { Page, Locator } from 'playwright';
import { HolderInfo } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { getInsuredUrl, escapeRegex, STATE_NAMES, toFullStateName, parseUSAddress } from './_base';
import fs from 'fs';
import path from 'path';

async function selectNgSelectByIndex(page: Page, index: number, value: string): Promise<boolean> {
  const selects = page.locator('ng-select');
  if (await selects.count() <= index) return false;

  const select = selects.nth(index);
  await select.click({ force: true });
  await page.waitForTimeout(300);

  const input = select.locator('input[aria-autocomplete="list"]').first();
  if (await input.count() > 0) {
    await input.fill(value);
    await page.waitForTimeout(600);
  }

  const exact = page.locator('ng-dropdown-panel .ng-option').filter({
    hasText: new RegExp(`^${escapeRegex(value)}$`, 'i'),
  }).first();
  const partial = page.locator('ng-dropdown-panel .ng-option').filter({
    hasText: new RegExp(escapeRegex(value), 'i'),
  }).first();

  if (await exact.count() > 0) {
    await exact.click({ force: true });
    await page.waitForTimeout(250);
    return true;
  }
  if (await partial.count() > 0) {
    await partial.click({ force: true });
    await page.waitForTimeout(250);
    return true;
  }

  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

/**
 * Navigates to the AdditionalInterests tab, then clicks "+ Add New".
 * Confirmed live: the tab is a plain <a> link (not .tab-link), and the
 * Add New button is a plain <a> link with href*="/AMSINS/AdditionalInterests/Insert".
 */
export async function openAdditionalInterestInsert(page: Page): Promise<void> {
  // Navigate directly to the AdditionalInterests page — more reliable than clicking the tab
  const aiUrl = getInsuredUrl(page, 'AdditionalInterests');
  await page.goto(aiUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Click "+ Add New" — confirmed live as a plain <a> link
  const addNew = page.locator('a[href*="/AMSINS/AdditionalInterests/Insert"]').first();
  await addNew.waitFor({ state: 'visible', timeout: 15_000 });
  await addNew.click({ force: true });
  await page.waitForURL('**/AMSINS/AdditionalInterests/Insert**', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

/**
 * Searches for an existing holder in the "Search list of existing holders" dropdown.
 * If not found, fills in Company Name and Address fields for a new holder.
 */
export async function searchOrCreateHolder(page: Page, holder: HolderInfo): Promise<void> {
  // Guard: verify the page is still alive before proceeding
  if (page.isClosed()) {
    throw new Error('searchOrCreateHolder: page was closed before holder search could start');
  }

  // Ensure the form is fully loaded before touching it
  await page.waitForSelector('input[placeholder="Company Name"]', { state: 'visible', timeout: 15_000 });

  // Confirmed live flow:
  // First ng-select on Additional Interests Insert is "Search list of existing holders".
  const foundExisting = await selectNgSelectByIndex(page, 0, holder.name.trim());
  if (foundExisting) {
    logger.info(`Found existing holder: "${holder.name}"`);
    return;
  }

  logger.info(`Creating new holder: "${holder.name}"`);

  // Re-check page is still open after the ng-select search attempt
  if (page.isClosed()) {
    throw new Error('searchOrCreateHolder: page closed during holder search');
  }

  const companyNameInput = page.locator('input[placeholder="Company Name"]').first();
  await companyNameInput.waitFor({ state: 'visible', timeout: 10_000 });
  await companyNameInput.fill(holder.name);

  // Parse address into components
  const { line1: address1, city, state, zip } = parseUSAddress(holder.address);

  if (address1) {
    const addr1 = page.locator('input[placeholder="Address Line 1"]').first();
    await addr1.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    await addr1.fill(address1).catch(() => page.fill('input[placeholder="Address Line 1"]', address1));
  }
  if (city) {
    const cityInput = page.locator('input[placeholder="City"]').first();
    await cityInput.fill(city).catch(() => page.fill('input[placeholder="City"]', city));
  }
  if (state) await selectNgSelectByIndex(page, 1, toFullStateName(state));
  if (zip) {
    const zipInput = page.locator('input[placeholder="Zip/Postal Code"]').first();
    await zipInput.fill(zip).catch(() => page.fill('input[placeholder="Zip/Postal Code"]', zip));
  }
}

/**
 * Writes a note into the "Description of Operations" textarea robustly.
 *
 * Strategy (Angular forms are picky — use the slowest, most realistic input):
 * 1. Click the textarea to focus it
 * 2. Select all + delete to clear any existing value
 * 3. Type the note character-by-character (pressSequentially)
 * 4. Blur the field to trigger Angular's change detection
 * 5. Verify the final value matches; if not, fall back to fill()
 */
export async function writeDescriptionOfOperations(page: Page, note: string): Promise<void> {
  const descField = page.locator('textarea[placeholder="Description of Operations"]').first();
  await descField.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  await descField.scrollIntoViewIfNeeded().catch(() => {});

  // Click + select all + delete to fully clear the field
  await descField.click({ force: true });
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);

  // Type character by character so Angular's keydown/input/keyup handlers fire properly
  await descField.pressSequentially(note, { delay: 5 });
  await page.waitForTimeout(200);

  // Blur the field to trigger Angular's onBlur change detection
  await descField.evaluate((el: any) => el.blur());
  await page.waitForTimeout(200);

  // Verify the full value was written
  const written = await descField.inputValue().catch(() => '');
  if (written !== note) {
    logger.warn(`writeDescriptionOfOperations: typed value mismatch (got ${written.length}/${note.length} chars), retrying with fill...`);
    await descField.fill(note);
    await descField.evaluate((el: any) => el.blur());
  }
}

/**
 * Navigates to "Send Certificate" from the current holder/additional interest,
 * adds all vehicles and drivers, and downloads the certificate.
 * Returns array of downloaded file paths.
 */
export async function downloadCertificate(
  page: Page,
  filename: string,
  holderName?: string,
  description?: string
): Promise<string[]> {
  const row = holderName
    ? page.locator('tr').filter({ hasText: new RegExp(escapeRegex(holderName), 'i') }).first()
    : page.locator('tr').first();

  const actions = row.locator('button,span,a').filter({ hasText: /Actions/i }).first();
  await actions.click({ force: true });
  await page.waitForTimeout(700);
  await page.locator('li, a, span').filter({ hasText: /^Send Certificate$/i }).first().click({ force: true });
  await page.waitForTimeout(2500);

  await checkAllCombo(page, 'ctl00_ContentPlaceHolder1_usrVehicles_ddlVehicles_Arrow', 'ctl00_ContentPlaceHolder1_usrVehicles_ddlVehicles_DropDown');
  await checkAllCombo(page, 'ctl00_ContentPlaceHolder1_usrDrivers_ddlDrivers_Arrow', 'ctl00_ContentPlaceHolder1_usrDrivers_ddlDrivers_DropDown');

  if (description?.trim()) {
    const desc = page.locator('#txtDescription').first();
    if (await desc.count() > 0) {
      await desc.fill(description.trim());
      await page.waitForTimeout(250);
    }
  }

  await page.locator('#ctl00_ContentPlaceHolder1_btnPreviewCertificate_input').click({ force: true });
  await page.waitForTimeout(5000);

  const filePath = await buildPreviewPdf(page, filename);
  return [filePath];
}

async function checkAllCombo(page: Page, arrowId: string, dropdownId: string): Promise<void> {
  const arrow = page.locator(`#${arrowId}`).first();
  if (await arrow.count() === 0) return;

  await arrow.click({ force: true }).catch(async () => {
    await arrow.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(400);

  const checkAll = page.locator(`#${dropdownId} .rcbCheckAllItemsCheckBox`).first();
  if (await checkAll.count() > 0) {
    await checkAll.evaluate((el: any) => el.click());
    await page.waitForTimeout(300);
  }

  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(250);
}

async function buildPreviewPdf(page: Page, filename: string): Promise<string> {
  const previewSrc = await page.locator('iframe[name="rwPreviewCertificate"]').getAttribute('src');
  if (!previewSrc) throw new Error('Preview certificate iframe not found');

  const context = page.context();
  const previewPage = await context.newPage();
  await previewPage.goto(previewSrc, { waitUntil: 'domcontentloaded' });
  await previewPage.waitForTimeout(4000);

  const innerSrc = await previewPage.locator('#ContentPlaceHolder1_PdfWebControl1').getAttribute('src');
  if (!innerSrc) {
    await previewPage.close().catch(() => {});
    throw new Error('Inner RadPdf viewer not found');
  }

  const fullInnerSrc = new URL(innerSrc, previewPage.url()).toString();
  const dk = new URL(fullInnerSrc).searchParams.get('dk');
  if (!dk) {
    await previewPage.close().catch(() => {});
    throw new Error('RadPdf document key not found');
  }

  const payload = await previewPage.evaluate(async (documentKey: string) => {
    const xml = await fetch(`/Pages/Certificates/RadPdf.axd?rt=6&dk=${documentKey}&r=1`).then(r => r.text());
    const pageCount = Number((xml.match(/<pagecount>(\d+)<\/pagecount>/)?.[1]) || '1');
    const pages: number[][] = [];

    for (let i = 1; i <= pageCount; i++) {
      const bytes = await fetch(`/Pages/Certificates/RadPdf.axd?rt=3&dk=${documentKey}&pn=${i}&pit=2`)
        .then(r => r.arrayBuffer())
        .then(b => Array.from(new Uint8Array(b)));
      pages.push(bytes);
    }

    return { pageCount, pages };
  }, dk);

  const dataUrls = payload.pages.map((bytes: number[]) => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
  const renderPage = await context.newPage();
  const html = `<!doctype html><html><head><style>
    body { margin: 0; background: white; }
    .page { width: 8.5in; height: 11in; page-break-after: always; display: flex; align-items: center; justify-content: center; }
    .page:last-child { page-break-after: auto; }
    img { width: 100%; height: 100%; object-fit: contain; display: block; }
  </style></head><body>${dataUrls.map(src => `<div class="page"><img src="${src}" /></div>`).join('')}</body></html>`;

  await renderPage.setContent(html, { waitUntil: 'load' });

  const dir = config.files.downloadsPath;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await renderPage.pdf({
    path: filePath,
    printBackground: true,
    width: '8.5in',
    height: '11in',
    margin: { top: '0in', right: '0in', bottom: '0in', left: '0in' },
  });

  await renderPage.close().catch(() => {});
  await previewPage.close().catch(() => {});
  logger.info(`Downloaded certificate PDF: ${filePath}`);
  return filePath;
}

/**
 * Selects an option from an ng-select multi-option dropdown by partial text match.
 * Does NOT filter via the search input because NowCerts policy dropdowns
 * only match from the start of the text (policy number), not by LOB name.
 * Instead opens the dropdown and clicks the option containing the value.
 */
export async function selectNgMultiOption(page: Page, index: number, value: string): Promise<boolean> {
  const selects = page.locator('ng-select');
  if (await selects.count() <= index) return false;

  const select = selects.nth(index);

  for (let attempt = 0; attempt < 3; attempt++) {
    await select.click({ force: true });
    await page.waitForTimeout(800 + attempt * 400); // Increase wait on each retry

    const option = page.locator('ng-dropdown-panel .ng-option').filter({
      hasText: new RegExp(escapeRegex(value), 'i'),
    }).first();

    if (await option.count() > 0 && await option.isVisible().catch(() => false)) {
      await option.click({ force: true });
      await page.waitForTimeout(300);
      return true;
    }

    // Options didn't appear — close dropdown and retry
    logger.debug(`selectNgMultiOption: attempt ${attempt + 1} — no option "${value}" visible, retrying...`);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }

  logger.warn(`selectNgMultiOption: option "${value}" not found after 3 attempts`);
  return false;
}

/**
 * Maps a policy type code to the row label shown in the
 * "Additional Interest for Certificates" table.
 * EXL = "Umbrella Liability" (not "Excess") — confirmed live 2026-03-13.
 */
export function policyLineLabel(policy: string): string {
  const map: Record<string, string> = {
    AL: 'Automobile Liability',
    NTL: 'Automobile Liability',
    GL: 'General Liability',
    WC: 'Workers Compensation',
    MTC: 'Cargo',
    APD: 'Physical Damage',
    EXL: 'Umbrella Liability',
  };
  return map[policy.toUpperCase()] ?? policy;
}

/**
 * Maps a policy type code to the label used in the policy-selection dropdown
 * (ng-select) when assigning policies to a holder.
 */
export function policySelectionLabel(policy: string): string {
  const map: Record<string, string> = {
    AL: 'Commercial Auto',
    NTL: 'Commercial Auto',
    GL: 'General Liability',
    WC: "Worker's Compensation",
    MTC: 'Cargo',
    APD: 'Physical Damage',
    EXL: 'Umbrella',
  };
  return map[policy.toUpperCase()] ?? policyLineLabel(policy);
}

/**
 * Returns the SUBR WVD (Waiver of Subrogation) checkbox Locator for a given policy row.
 * Synchronous — returns a Playwright Locator (no await needed).
 */
export function wosCheckbox(page: Page, policy: string): Locator {
  const key = policy.toUpperCase();
  if (key === 'WC') {
    // WC row only has one checkbox: #workersCompensationSubrWvd (confirmed live)
    return page.locator('#workersCompensationSubrWvd').first();
  }

  // For GL/AL/EXL: SUBR WVD is the 2nd checkbox (id="") in the row.
  // Row label confirmed live: GL="General Liability", AL="Automobile Liability", EXL="Umbrella Liability"
  const label = policyLineLabel(policy);
  const row = page.locator('table tr').filter({ hasText: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, 'i') }).first();
  return row.locator('input[type="checkbox"]').nth(1);
}
