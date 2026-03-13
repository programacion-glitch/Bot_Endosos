import { Page } from 'playwright';
import { ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation, cleanClientName, getInsuredUrl } from './_base';
import { config } from '../config/config';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function chooseAuthorizedRepresentative(page: Page, authorizedRep: string): Promise<void> {
  const combo = page.locator('#ctl00_ContentPlaceHolder1_usrAcord25_usrSignatureSelector_rcbSignatures').first();
  const input = page.locator('#ctl00_ContentPlaceHolder1_usrAcord25_usrSignatureSelector_rcbSignatures_Input').first();
  const arrow = page.locator('#ctl00_ContentPlaceHolder1_usrAcord25_usrSignatureSelector_rcbSignatures_Arrow').first();
  const clientState = page.locator('#ctl00_ContentPlaceHolder1_usrAcord25_usrSignatureSelector_rcbSignatures_ClientState').first();
  const dropdownItems = page.locator('#ctl00_ContentPlaceHolder1_usrAcord25_usrSignatureSelector_rcbSignatures_DropDown li.rcbItem');

  await page.waitForFunction(() => {
    const doc = (globalThis as any).document;
    const loading = doc?.getElementById?.('signatureLoading');
    return !loading || !/refreshing/i.test(loading.textContent || '');
  }, { timeout: 15000 }).catch(() => {});

  const currentValue = await input.inputValue().catch(() => '');
  const stateValue = await clientState.inputValue().catch(() => '');
  if (
    new RegExp(`^${escapeRegex(authorizedRep)}$`, 'i').test(currentValue) ||
    new RegExp(`"text"\s*:\s*"${escapeRegex(authorizedRep)}"`, 'i').test(stateValue)
  ) {
    return;
  }

  if (await arrow.count() > 0) {
    await arrow.click({ force: true }).catch(async () => {
      await arrow.evaluate((el: any) => el.click());
    });
  } else {
    await combo.click({ force: true }).catch(async () => {
      await combo.evaluate((el: any) => el.click());
    });
  }
  await page.waitForTimeout(500);

  const exact = dropdownItems.filter({ hasText: new RegExp(`^${escapeRegex(authorizedRep)}$`, 'i') }).first();
  const partial = dropdownItems.filter({ hasText: new RegExp(escapeRegex(authorizedRep), 'i') }).first();
  const option = (await exact.count()) > 0 ? exact : partial;

  if (await option.count() === 0) {
    logger.warn(`createMaster: authorized rep "${authorizedRep}" option not found`);
    return;
  }

  await option.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  await option.click({ force: true }).catch(async () => {
    await option.evaluate((el: any) => el.click());
  });

  await page.waitForFunction(
    ({ expected }) => {
      const doc = (globalThis as any).document;
      const inputEl = doc?.getElementById?.('ctl00_ContentPlaceHolder1_usrAcord25_usrSignatureSelector_rcbSignatures_Input');
      const stateEl = doc?.getElementById?.('ctl00_ContentPlaceHolder1_usrAcord25_usrSignatureSelector_rcbSignatures_ClientState');
      const inputValue = inputEl?.value || '';
      const clientStateValue = stateEl?.value || '';
      return inputValue === expected || clientStateValue.includes(`"text":"${expected}"`);
    },
    { expected: authorizedRep },
    { timeout: 5000 }
  ).catch(() => {});

  await page.waitForTimeout(500);
}

/**
 * CREATE MASTER
 * Steps:
 * 1. Documents -> Certificates(Master) -> Add New
 * 2. Remove period and DBA from client name field
 * 3. Set Authorized Representative (configurable via NOWCERTS_AUTHORIZED_REP)
 * 4. Save
 */
export async function createMaster(page: Page): Promise<ActionResult> {
  logger.info('createMaster: creating master certificate');

  try {
    const certificatesUrl = getInsuredUrl(page, 'Certificates');
    await page.goto(certificatesUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/Certificates', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const addNewLink = page.locator('a[href*="/Certificates/Insert.aspx"], a.mdi.mdi-plus.mr-5, a.cursor-pointer.font-fixed-18.mdi.mdi-plus').first();
    if (await addNewLink.count() > 0) {
      const href = await addNewLink.getAttribute('href');
      if (href) {
        await page.goto(href, { waitUntil: 'domcontentloaded' });
      } else {
        await addNewLink.click({ force: true });
      }
    } else {
      const addNewText = page.locator('a.action-insert').filter({ hasText: /\+ Add New/i }).first();
      await addNewText.click({ force: true });
    }

    await page.waitForURL('**/Certificates/Insert.aspx**', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const nameInput = page.locator('#txtName').first();
    const insuredNameInput = page.locator('#ContentPlaceHolder1_usrAcord25_txt_Fsb_0_eb_dt_P1sb_0_eb_dt_NamedInsured_FullName_Asb_0_eb').first();
    let cleanName = '';
    if (await insuredNameInput.count() > 0) {
      cleanName = cleanClientName(await insuredNameInput.inputValue());
    }
    if (!cleanName) {
      cleanName = cleanClientName(await nameInput.inputValue());
    }

    await nameInput.fill('');
    await nameInput.fill(cleanName);

    await chooseAuthorizedRepresentative(page, config.nowcerts.authorizedRep);

    const saveBtn = page.locator('#ctl00_ContentPlaceHolder1_btnInsert_input, #ctl00_ContentPlaceHolder1_btnInsert').first();
    await saveBtn.click({ force: true });
    await waitForSaveConfirmation(page);

    return ok('CREATE_MASTER', 'Master certificate created successfully.');
  } catch (err) {
    return fail('CREATE_MASTER', (err as Error).message, err as Error);
  }
}
