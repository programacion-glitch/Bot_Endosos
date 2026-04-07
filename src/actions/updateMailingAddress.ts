import { Page } from 'playwright';
import { UpdateMailingAddressCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import {
  ok,
  fail,
  escapeRegex,
  cleanClientName,
  todayYYYYMMdd,
  getInsuredIdFromUrl,
  buildInsuredUrl,
  buildTruckingCompanyEditUrl,
  triggerDownload,
  parseUSAddress,
} from './_base';
import { config } from '../config/config';
import fs from 'fs';
import path from 'path';

type ParsedAddress = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
};

/** Pre-computed URLs for a specific insured so navigation doesn't lose the ID */
type InsuredUrls = {
  truckingEdit: string;
  certificates: string;
  pdfForms: string;
};

function buildInsuredUrls(insuredId: string): InsuredUrls {
  return {
    truckingEdit: buildTruckingCompanyEditUrl(insuredId),
    certificates: buildInsuredUrl(insuredId, 'Certificates'),
    pdfForms: buildInsuredUrl(insuredId, 'PdfForms'),
  };
}

function parseAddress(address: string): ParsedAddress {
  const parsed = parseUSAddress(address);
  return {
    line1: parsed.line1,
    line2: '',
    city: parsed.city,
    state: parsed.state,
    zip: parsed.zip,
  };
}

async function selectRadComboByText(page: Page, inputSelector: string, arrowSelector: string, value: string): Promise<void> {
  const input = page.locator(inputSelector).first();
  const arrow = page.locator(arrowSelector).first();
  if (await input.count() === 0 || await arrow.count() === 0) return;

  await input.fill(value);
  await page.waitForTimeout(300);
  await arrow.click({ force: true }).catch(async () => {
    await arrow.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(600);

  const option = page.locator('li.rcbItem, li.rcbHovered, .rcbList li').filter({
    hasText: new RegExp(`^${escapeRegex(value)}$`, 'i'),
  }).first();
  if (await option.count() > 0) {
    await option.click({ force: true }).catch(async () => {
      await option.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(300);
  }
}

async function updateInsuredProfileAddress(page: Page, urls: InsuredUrls, addr: ParsedAddress): Promise<void> {
  await page.goto(urls.truckingEdit, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2500);

  await page.fill('#ContentPlaceHolder1_FormView1_ctl01_ctl10___AddressLine1_TextBox1', addr.line1);
  await page.fill('#ContentPlaceHolder1_FormView1_ctl01_ctl11___AddressLine2_TextBox1', addr.line2);
  await page.fill('#ContentPlaceHolder1_FormView1_ctl01_ctl12___City_TextBox1', addr.city);
  await selectRadComboByText(
    page,
    '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl13___StateId_usrState_ddlStates_Input',
    '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl13___StateId_usrState_ddlStates_Arrow',
    addr.state
  );
  await page.fill('#ContentPlaceHolder1_FormView1_ctl01_ctl14___County_TextBox1', '');
  await page.fill('#ContentPlaceHolder1_FormView1_ctl01_ctl15___ZipCode_TextBox1', addr.zip);

  const updateBtn = page.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input, #btnUpdate_input').first();
  await updateBtn.scrollIntoViewIfNeeded().catch(() => {});
  await updateBtn.evaluate((el: any) => el.click());
  await page.waitForTimeout(5000);
}

async function updateMasterAddress(page: Page, urls: InsuredUrls, addr: ParsedAddress): Promise<void> {
  await page.goto(urls.certificates, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2000);

  const certRows = page.locator('table tbody tr').filter({
    has: page.locator('button, a, span').filter({ hasText: /Actions/i }),
  });
  const count = await certRows.count();
  if (count !== 1) {
    throw new Error(`Expected exactly 1 master certificate row, found ${count}`);
  }

  const row = certRows.first();
  await row.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  await page.locator('.k-animation-container .k-item, .k-menu-popup .k-item').filter({ hasText: /^Edit$/i }).first().click();

  // Wait for modal popup or full-page navigation
  await page.waitForURL('**/Certificates/Edit.aspx**', { timeout: 5_000 }).catch(() => {});
  let editContext: typeof page | ReturnType<typeof page.frame> = page;

  if (page.url().includes('/Certificates/Edit.aspx')) {
    await page.waitForTimeout(3000);
  } else {
    let found = false;
    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      await page.waitForTimeout(2000 + attempt * 1000);
      const frame = page.frame({ name: 'rwPopup' });
      if (frame) { editContext = frame; found = true; break; }
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const has = await f.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').count().catch(() => 0);
        if (has > 0) { editContext = f; found = true; break; }
      }
    }
    if (!found) throw new Error('Master certificate edit modal did not load');
  }

  await editContext.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_LineOne_Asb_0_eb').fill(addr.line1);
  await editContext.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_LineTwo_Asb_0_eb').fill(addr.line2);
  await editContext.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_CityName_Asb_0_eb').fill(addr.city);
  await editContext.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_StateOrProvinceCode_Asb_0_eb').fill(addr.state.slice(0, 2).toUpperCase());
  await editContext.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_PostalCode_Asb_0_eb').fill(addr.zip);
  const updateBtn = editContext.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').first();
  await updateBtn.scrollIntoViewIfNeeded().catch(() => {});
  await updateBtn.evaluate((el: any) => el.click());
  await page.waitForTimeout(5000);
}

/**
 * Finds all edited ID Card rows on the PdfForms page.
 * Returns the row names (text) for each ID Card found in the "Edited Forms" grid (first grid).
 */
async function findEditedIdCardRows(page: Page, urls: InsuredUrls): Promise<string[]> {
  await page.goto(urls.pdfForms, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // The first grid contains "Edited Forms" — search for ID CARD entries
  const editedGrid = page.getByRole('grid', { name: 'Data table' }).first();
  const rows = editedGrid.locator('tr').filter({ hasText: /ID\s*CARD/i });
  const count = await rows.count();

  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const text = await rows.nth(i).textContent().catch(() => '');
    names.push(text?.trim() ?? '');
  }
  return names;
}

/**
 * Opens an edited ID Card for editing from the PdfForms page.
 * The page should already be on the PdfForms page.
 */
async function openEditedIdCard(page: Page, index: number): Promise<void> {
  const editedGrid = page.getByRole('grid', { name: 'Data table' }).first();
  const idCardRows = editedGrid.locator('tr').filter({ hasText: /ID\s*CARD/i });

  const row = idCardRows.nth(index);
  await row.waitFor({ state: 'visible', timeout: 10_000 });

  const actions = row.locator('[aria-label="..."]').first();
  await actions.click({ force: true }).catch(async () => {
    await actions.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(300);

  const editLink = page.locator('a').filter({ hasText: /^Edit$/i }).first();
  await editLink.click({ force: true });
  await page.waitForURL('**/Files/*', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

/**
 * Updates the address fields in an ID Card that is currently open for editing.
 * Also cleans the insured name (removes trailing period and empty DBA).
 * Returns the effective date found in the card (for the download filename).
 */
async function updateIdCardAddress(page: Page, addr: ParsedAddress): Promise<string> {
  // Open Form Data panel
  const formDataButton = page.locator('button[title="Toggle Form Data Panel"], button').filter({ hasText: /^Form Data$/i }).first();
  await formDataButton.click({ force: true }).catch(async () => {
    await formDataButton.evaluate((el: any) => el.click());
  });
  await page.locator('#dataSource_formName').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1000);

  // Read current effective date before modifying
  const effectiveDateField = page.locator('input[name="F[0].P1[0].Policy_EffectiveDate_A[0]"]').first();
  const effectiveDate = await effectiveDateField.inputValue().catch(() => '');

  // Update insured name (clean it)
  const insuredNameField = page.locator('input[name="F[0].P1[0].NamedInsured_FullName_A[0]"]').first();
  const rawName = await insuredNameField.inputValue().catch(() => '');
  await insuredNameField.fill(cleanClientName(rawName));

  // Update address fields
  const addrLine1 = page.locator('input[name="F[0].P1[0].NamedInsured_MailingAddress_LineOne_A[0]"]').first();
  const addrCity = page.locator('input[name="F[0].P1[0].NamedInsured_MailingAddress_CityName_A[0]"]').first();
  const addrState = page.locator('input[name="F[0].P1[0].NamedInsured_MailingAddress_StateOrProvinceCode_A[0]"]').first();
  const addrZip = page.locator('input[name="F[0].P1[0].NamedInsured_MailingAddress_PostalCode_A[0]"]').first();

  if (await addrLine1.count() > 0) await addrLine1.fill(addr.line1);
  if (await addrCity.count() > 0) await addrCity.fill(addr.city);
  if (await addrState.count() > 0) await addrState.fill(addr.state.slice(0, 2).toUpperCase());
  if (await addrZip.count() > 0) await addrZip.fill(addr.zip);

  return effectiveDate;
}

/**
 * Saves the currently open ID Card and returns to PdfForms.
 */
async function saveIdCard(page: Page): Promise<void> {
  // Close Form Data panel first
  const closeButton = page.locator('button.ant-drawer-close[aria-label="Close"]').first();
  if (await closeButton.count() > 0) {
    await closeButton.click({ force: true }).catch(async () => {
      await closeButton.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(300);
  }

  const saveButton = page.locator('button').filter({ hasText: /^Save$/i }).first();
  await saveButton.click({ force: true }).catch(async () => {
    await saveButton.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(500);

  const confirmYes = page.locator('button').filter({ hasText: /^Yes$/i }).first();
  if (await confirmYes.count() > 0) {
    await confirmYes.click({ force: true }).catch(async () => {
      await confirmYes.evaluate((el: any) => el.click());
    });
  }

  await page.waitForURL('**/PdfForms', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

/**
 * Downloads a flattened ID Card from the PdfForms page (should already be on it after save).
 */
async function downloadIdCard(page: Page, rowIndex: number, filename: string): Promise<string> {
  const editedGrid = page.getByRole('grid', { name: 'Data table' }).first();
  const idCardRows = editedGrid.locator('tr').filter({ hasText: /ID\s*CARD/i });
  const row = idCardRows.nth(rowIndex);
  await row.waitFor({ state: 'visible', timeout: 15_000 });

  return await triggerDownload(
    page,
    async () => {
      const actions = row.locator('[aria-label="..."]').first();
      await actions.click({ force: true }).catch(async () => {
        await actions.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(300);

      const downloadItem = page.locator('[role="menuitem"], li').filter({ hasText: /^Download$/i }).first();
      await downloadItem.hover();
      await page.waitForTimeout(300);

      const flattenItem = page.locator('[role="menuitem"], li').filter({ hasText: /^Flatten \(not editable\)$/i }).first();
      await flattenItem.click({ force: true }).catch(async () => {
        await flattenItem.evaluate((el: any) => el.click());
      });
    },
    filename
  );
}

/**
 * Updates all edited ID Cards with the new address, then downloads each.
 */
async function updateIdCards(page: Page, urls: InsuredUrls, addr: ParsedAddress): Promise<string[]> {
  const idCardNames = await findEditedIdCardRows(page, urls);
  if (idCardNames.length === 0) {
    logger.info('updateMailingAddress: no edited ID Card forms found — skipping ID card update');
    return [];
  }

  logger.info(`updateMailingAddress: found ${idCardNames.length} edited ID Card(s) to update`);
  const files: string[] = [];
  const today = todayYYYYMMdd();

  for (let i = 0; i < idCardNames.length; i++) {
    try {
      // Navigate to PdfForms before each card (we return here after save)
      await page.goto(urls.pdfForms, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      await openEditedIdCard(page, i);
      const effectiveDate = await updateIdCardAddress(page, addr);
      await saveIdCard(page);

      // Download the updated ID Card
      const safeDatePart = effectiveDate.replace(/\//g, '-') || 'unknown';
      const filename = `${today}_ID_CARD_${i + 1}_eff_${safeDatePart}.pdf`;
      const filePath = await downloadIdCard(page, i, filename);
      files.push(filePath);

      logger.info(`updateMailingAddress: ID Card ${i + 1}/${idCardNames.length} updated and downloaded`);
    } catch (err) {
      logger.error(`updateMailingAddress: failed to update ID Card ${i + 1}: ${(err as Error).message}`);
      // Continue with remaining cards
    }
  }

  return files;
}

/**
 * UPDATE MAILING ADDRESS
 * 1. Update insured profile address
 * 2. Update master certificate address
 * 3. Update each edited ID Card: address, effective date, clean name, save, download
 */
export async function updateMailingAddress(
  page: Page,
  cmd: UpdateMailingAddressCommand
): Promise<ActionResult> {
  logger.info(`updateMailingAddress: "${cmd.address}"`);

  try {
    // Pre-compute all URLs before navigating away from the insured profile
    const insuredId = getInsuredIdFromUrl(page);
    const urls = buildInsuredUrls(insuredId);

    const addr = parseAddress(cmd.address);
    await updateInsuredProfileAddress(page, urls, addr);
    await updateMasterAddress(page, urls, addr);

    const files = await updateIdCards(page, urls, addr);

    const msg = files.length > 0
      ? `Mailing address updated on profile, master, and ${files.length} ID Card(s).`
      : 'Mailing address updated on profile and master certificate. No edited ID Cards found.';

    return ok('UPDATE_MAILING_ADDRESS', msg, files.length > 0 ? files : undefined);
  } catch (err) {
    return fail('UPDATE_MAILING_ADDRESS', (err as Error).message, err as Error);
  }
}
