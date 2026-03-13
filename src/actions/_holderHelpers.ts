/**
 * Shared helpers for Additional Interests / Holder operations.
 * Reused by addAdditionalInsured, addWaiverSubrogation, addNoteToHolder, addLossPayee, etc.
 */
import { Page } from 'playwright';
import { HolderInfo } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config/config';
import { getInsuredUrl } from './_base';
import fs from 'fs';
import path from 'path';

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

function toFullStateName(value: string): string {
  return STATE_NAMES[value.toUpperCase()] ?? value;
}

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const parts = holder.address.split(',').map(s => s.trim());
  const address1 = parts[0] ?? '';
  const city = parts[1] ?? '';
  const state = parts[2] ?? '';
  const zip = parts[3] ?? '';

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
