import { Page } from 'playwright';
import { UpdateMailingAddressCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import {
  ok,
  fail,
  escapeRegex,
  getInsuredIdFromUrl,
  buildInsuredUrl,
  buildTruckingCompanyDetailsUrl,
  buildTruckingCompanyEditUrl,
} from './_base';

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
  truckingDetailsPage14: string;
};

function buildInsuredUrls(insuredId: string): InsuredUrls {
  return {
    truckingEdit: buildTruckingCompanyEditUrl(insuredId),
    certificates: buildInsuredUrl(insuredId, 'Certificates'),
    truckingDetailsPage14: buildTruckingCompanyDetailsUrl(insuredId, 14),
  };
}

function parseAddress(address: string): ParsedAddress {
  const parts = address.split(',').map(s => s.trim());
  return {
    line1: parts[0] ?? '',
    line2: '',
    city: parts[1] ?? '',
    state: parts[2] ?? '',
    zip: parts[3] ?? '',
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
  await page.locator('li, a, span').filter({ hasText: /^Edit$/i }).first().click({ force: true });
  await page.waitForTimeout(3000);

  const frame = page.frame({ name: 'rwPopup' });
  if (!frame) {
    throw new Error('Master certificate edit popup did not load');
  }

  await frame.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_LineOne_Asb_0_eb').fill(addr.line1);
  await frame.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_LineTwo_Asb_0_eb').fill(addr.line2);
  await frame.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_CityName_Asb_0_eb').fill(addr.city);
  await frame.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_StateOrProvinceCode_Asb_0_eb').fill(addr.state.slice(0, 2).toUpperCase());
  await frame.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_MailingAddress_PostalCode_Asb_0_eb').fill(addr.zip);
  const updateBtn = frame.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').first();
  await updateBtn.scrollIntoViewIfNeeded().catch(() => {});
  await updateBtn.evaluate((el: any) => el.click());
  await page.waitForTimeout(5000);
}

async function checkEditedIdCards(page: Page, urls: InsuredUrls): Promise<number> {
  await page.goto(urls.truckingDetailsPage14, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(2500);

  const editedRows = page.locator('text=Edited Forms').locator('..').locator('..').locator('table tbody tr');
  const count = await editedRows.count().catch(() => 0);
  const body = await page.locator('body').innerText().catch(() => '');
  if (/No records to display\./i.test(body)) {
    return 0;
  }
  return count;
}

/**
 * UPDATE MAILING ADDRESS
 * - insured profile address via old insured edit route
 * - master certificate address via popup edit
 *
 * ID cards remain dependent on existing edited ID Card forms for the client.
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

    const editedIdCards = await checkEditedIdCards(page, urls);
    if (editedIdCards === 0) {
      logger.warn('updateMailingAddress: no edited ID Card forms found for this insured; ID card update skipped');
      return ok('UPDATE_MAILING_ADDRESS', 'Mailing address updated on insured profile and master certificate. No edited ID Cards were available to update.');
    }

    logger.warn(`updateMailingAddress: ${editedIdCards} edited ID Card form(s) found, but automated edit/download flow is not finalized yet`);
    return ok('UPDATE_MAILING_ADDRESS', 'Mailing address updated on insured profile and master certificate. ID Card update remains pending.');
  } catch (err) {
    return fail('UPDATE_MAILING_ADDRESS', (err as Error).message, err as Error);
  }
}
