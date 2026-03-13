import { Page } from 'playwright';
import { AddPolicyCommand, AddVehicleCommand, ActionResult, Command } from '../types';
import { logger } from '../utils/logger';
import {
  cleanClientName,
  fail,
  getInsuredUrl,
  ok,
  todayYYYYMMdd,
  triggerDownload,
  waitForSaveConfirmation,
} from './_base';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDateValue(value: string): string {
  const parts = value.split(/[^\d]/).filter(Boolean);
  if (parts.length !== 3) return value.trim();
  return `${Number(parts[0])}/${Number(parts[1])}/${parts[2]}`;
}

async function selectRadComboByText(page: Page, arrowSelector: string, text: string): Promise<boolean> {
  const arrow = page.locator(arrowSelector).first();
  if (await arrow.count() === 0) return false;

  await arrow.click({ force: true }).catch(async () => {
    await arrow.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(400);

  const exact = page.locator('li.rcbItem, li.rcbHovered, .rcbList li').filter({
    hasText: new RegExp(`^${escapeRegex(text)}$`, 'i'),
  }).first();
  const partial = page.locator('li.rcbItem, li.rcbHovered, .rcbList li').filter({
    hasText: new RegExp(escapeRegex(text), 'i'),
  }).first();

  if (await exact.count() > 0) {
    await exact.click({ force: true }).catch(async () => {
      await exact.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(300);
    return true;
  }

  if (await partial.count() > 0) {
    await partial.click({ force: true }).catch(async () => {
      await partial.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(300);
    return true;
  }

  await page.keyboard.press('Escape').catch(() => {});
  return false;
}

function inferVehicleType(cmd: AddVehicleCommand): 'Truck' | 'Trailer' {
  const text = `${cmd.description} ${cmd.rawText}`.toLowerCase();
  return text.includes('trailer') ? 'Trailer' : 'Truck';
}

function getPriorALPolicyNumber(commands: Command[], currentCommand: AddVehicleCommand): string | null {
  const currentIndex = commands.indexOf(currentCommand as Command);
  const priorCommands = currentIndex >= 0 ? commands.slice(0, currentIndex) : commands;
  const priorPolicies = priorCommands.filter((command): command is AddPolicyCommand => command.type === 'ADD_POLICY');
  const priorALPolicies = priorPolicies.filter(command => command.policyType === 'AL');

  if (priorALPolicies.length > 0) {
    return priorALPolicies[priorALPolicies.length - 1].policyNumber;
  }

  if (priorPolicies.some(command => command.policyType === 'NTL')) {
    logger.info('createIDCard: skipped because the email added NTL, not AL');
    return null;
  }

  return null;
}

async function resolveIdCardPolicyNumber(
  _page: Page,
  cmd: AddVehicleCommand,
  commands: Command[]
): Promise<string | null> {
  if (inferVehicleType(cmd) !== 'Truck') {
    logger.info(`createIDCard: skipped for trailer VIN ${cmd.vin}`);
    return null;
  }

  const priorALPolicyNumber = getPriorALPolicyNumber(commands, cmd);
  if (priorALPolicyNumber) {
    return priorALPolicyNumber;
  }

  logger.info(`createIDCard: skipped for VIN ${cmd.vin} because no AL policy was added in current request context`);

  return null;
}

async function selectAntOption(page: Page, selectIndex: number, matcher: RegExp): Promise<void> {
  const select = page.locator('.ant-select').nth(selectIndex);
  await select.click({ force: true }).catch(async () => {
    await select.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(400);

  const option = page.locator('.ant-select-dropdown .ant-select-item-option').filter({ hasText: matcher }).first();
  if (await option.count() === 0) {
    throw new Error(`ID Card option not found: ${matcher}`);
  }

  await option.click({ force: true }).catch(async () => {
    await option.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape').catch(() => {});
}

async function openIdCardTemplate(page: Page): Promise<void> {
  const pdfFormsUrl = getInsuredUrl(page, 'PdfForms');
  await page.goto(pdfFormsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const allFormsSearchName = page.locator('input[placeholder="Name"]').nth(1);
  await allFormsSearchName.fill('ID CARD');

  const allFormsSearchButton = page.getByRole('button', { name: 'Search' }).nth(1);
  await allFormsSearchButton.click({ force: true });
  await page.waitForTimeout(1500);

  const allFormsGrid = page.getByRole('grid', { name: 'Data table' }).nth(1);
  let templateRow = allFormsGrid.locator('tr').filter({ hasText: /^.*ID CARD VIN#.*$/i }).first();
  if (await templateRow.count() === 0) {
    templateRow = page.locator('tr').filter({ hasText: /^.*ID CARD VIN#.*$/i }).last();
  }
  await templateRow.waitFor({ state: 'visible', timeout: 15_000 });

  const actions = templateRow.locator('[aria-label="..."]').first();
  await actions.click({ force: true }).catch(async () => {
    await actions.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(300);

  const editLink = page.locator('a').filter({ hasText: /^Edit$/i }).first();
  await editLink.click({ force: true });
  await page.waitForURL('**/Files/*', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

async function openFormData(page: Page): Promise<void> {
  const formDataButton = page.locator('button[title="Toggle Form Data Panel"], button').filter({ hasText: /^Form Data$/i }).first();
  await formDataButton.click({ force: true }).catch(async () => {
    await formDataButton.evaluate((el: any) => el.click());
  });
  await page.locator('#dataSource_formName').waitFor({ state: 'visible', timeout: 15_000 });
}

async function closeFormData(page: Page): Promise<void> {
  const closeButton = page.locator('button.ant-drawer-close[aria-label="Close"]').first();
  if (await closeButton.count() > 0) {
    await closeButton.click({ force: true }).catch(async () => {
      await closeButton.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(300);
  }
}

async function saveIdCard(page: Page): Promise<void> {
  await closeFormData(page);

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

async function downloadFlattenedIdCard(
  page: Page,
  targetName: string,
  policyNumber: string,
  last4: string,
  today: string
): Promise<string> {
  const exactRow = page.locator('tr').filter({
    hasText: new RegExp(`${escapeRegex(targetName)}[\s\S]*${escapeRegex(policyNumber)}`, 'i'),
  }).first();
  const fallbackRow = page.locator('tr').filter({ hasText: new RegExp(escapeRegex(targetName), 'i') }).first();
  const row = (await exactRow.count()) > 0 ? exactRow : fallbackRow;
  await row.waitFor({ state: 'visible', timeout: 15_000 });

  const filename = `${today}_ID_CARD_VIN_${last4}.pdf`;

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
 * ADD VEHICLE / TRAILER
 * Steps:
 * 1. Insured Items -> Vehicles -> Add New
 * 2. Fill VIN, click Check VIN, validate year matches
 *    - If mismatch: send alert and abort
 * 3. Fill Description, Usage=Commercial, Value (if any)
 * 4. Save
 * 5. If client has AL policy: create ID Card
 */
export async function addVehicle(
  page: Page,
  cmd: AddVehicleCommand,
  commands: Command[] = []
): Promise<ActionResult> {
  logger.info(`addVehicle: VIN=${cmd.vin} Year=${cmd.year}`);

  try {
    const vehiclesUrl = getInsuredUrl(page, 'Vehicles');
    await page.goto(vehiclesUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const addNewLink = page.locator('a.action-insert').filter({ hasText: /\+ Add New/i }).first();
    await addNewLink.waitFor({ state: 'visible', timeout: 20_000 });
    const href = await addNewLink.getAttribute('href');
    if (href) {
      await page.goto(href, { waitUntil: 'domcontentloaded' });
    } else {
      await addNewLink.click({ force: true });
    }
    await page.waitForURL('**/Vehicles/Insert.aspx**', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    await selectRadComboByText(
      page,
      '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl00___Type_ddlEnum_Arrow',
      inferVehicleType(cmd)
    );

    await page.fill('#ContentPlaceHolder1_FormView1_ctl01_ctl01___VIN_Number_txtVin', cmd.vin);

    await page.click('#ContentPlaceHolder1_FormView1_ctl01_ctl01___VIN_Number_lnkCheckVin');
    await page.waitForTimeout(3500);

    const vinYear = await page.locator('#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl03___Year_ComboBox1_Input').inputValue();
    const vinMake = await page.locator('#ContentPlaceHolder1_FormView1_ctl01_ctl02___Make_TextBox1').inputValue().catch(() => '');
    const vinModel = await page.locator('#ContentPlaceHolder1_FormView1_ctl01_ctl04___Model_TextBox1').inputValue().catch(() => '');

    if (vinYear && vinYear !== cmd.year) {
      const alertMsg = [
        `Vehicle year ${cmd.year} does not match VIN Check (got ${vinYear}). Please send the complete vehicle information.`,
        '',
        `-Type: ${inferVehicleType(cmd)}`,
        `-VIN Number: ${cmd.vin}`,
        `-Make: ${vinMake}`,
        `-Year (requested): ${cmd.year}`,
        `-Year (VIN check): ${vinYear}`,
        `-Model: ${vinModel}`,
        `-Description: ${cmd.description}`,
        `-Value: ${cmd.value ?? ''}`,
      ].join('\n');

      return fail('ADD_VEHICLE', alertMsg);
    }

    await selectRadComboByText(
      page,
      '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl03___Year_ComboBox1_Arrow',
      cmd.year
    );
    await page.fill('#ContentPlaceHolder1_FormView1_ctl01_ctl05___Description_TextBox1', cmd.description);

    await selectRadComboByText(
      page,
      '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl08___TypeOfUse_ddlEnum_Arrow',
      cmd.usage ?? 'Commercial'
    );

    if (cmd.value) {
      await page.fill(
        '#ContentPlaceHolder1_FormView1_ctl01_ctl09___Price_TextBox1',
        cmd.value.replace(/[^0-9.]/g, '')
      );
    }

    await page.click('#btnInsert_input');
    await waitForSaveConfirmation(page);

    const files: string[] = [];
    const idCardPolicyNumber = await resolveIdCardPolicyNumber(page, cmd, commands);
    if (idCardPolicyNumber) {
      const idCardFile = await createIDCard(page, cmd.vin, cmd.effectiveDate, idCardPolicyNumber);
      if (idCardFile) files.push(idCardFile);
    }

    return ok('ADD_VEHICLE', `Vehicle VIN ${cmd.vin} added successfully.`, files);
  } catch (err) {
    return fail('ADD_VEHICLE', (err as Error).message, err as Error);
  }
}

/**
 * Creates an ID Card for the newly added vehicle.
 */
async function createIDCard(
  page: Page,
  vin: string,
  effectiveDate: string,
  policyNumber: string
): Promise<string | null> {
  logger.info(`Creating ID Card for VIN: ${vin} using policy ${policyNumber}`);
  const last4 = vin.slice(-4);
  const today = todayYYYYMMdd();
  const targetName = `ID CARD VIN# ${last4}`;

  try {
    await openIdCardTemplate(page);
    await openFormData(page);

    await page.locator('#dataSource_formName').fill(targetName);

    await selectAntOption(page, 0, new RegExp(`^${escapeRegex(policyNumber)}\\b`, 'i'));
    await selectAntOption(page, 1, new RegExp(escapeRegex(vin), 'i'));

    const policyNumberField = page.locator('input[name="F[0].P1[0].Policy_PolicyNumberIdentifier_A[0]"]').first();
    const effectiveDateField = page.locator('input[name="F[0].P1[0].Policy_EffectiveDate_A[0]"]').first();
    const insuredNameField = page.locator('input[name="F[0].P1[0].NamedInsured_FullName_A[0]"]').first();
    const vinField = page.locator('input[name="F[0].P1[0].Vehicle_VINIdentifier_A[0]"]').first();

    await page.waitForFunction(
      ({ expectedPolicyNumber, expectedVin }) => {
        const doc = (globalThis as any).document;
        const policyInput = doc?.querySelector('input[name="F[0].P1[0].Policy_PolicyNumberIdentifier_A[0]"]');
        const vinInput = doc?.querySelector('input[name="F[0].P1[0].Vehicle_VINIdentifier_A[0]"]');
        return (
          (policyInput?.value || '').includes(expectedPolicyNumber) &&
          (vinInput?.value || '').includes(expectedVin)
        );
      },
      { expectedPolicyNumber: policyNumber, expectedVin: vin },
      { timeout: 10_000 }
    ).catch(() => {});

    const currentEffectiveDate = await effectiveDateField.inputValue().catch(() => '');
    if (normalizeDateValue(currentEffectiveDate) !== normalizeDateValue(effectiveDate)) {
      await effectiveDateField.fill(normalizeDateValue(effectiveDate));
    }

    const rawInsuredName = await insuredNameField.inputValue().catch(() => '');
    await insuredNameField.fill(cleanClientName(rawInsuredName));

    const currentPolicyNumber = await policyNumberField.inputValue().catch(() => '');
    const currentVin = await vinField.inputValue().catch(() => '');
    if (!currentPolicyNumber.includes(policyNumber) || !currentVin.includes(vin)) {
      throw new Error(`ID Card data did not populate correctly for VIN ${vin} and policy ${policyNumber}`);
    }

    await saveIdCard(page);
    return await downloadFlattenedIdCard(page, targetName, policyNumber, last4, today);
  } catch (err) {
    logger.error(`Failed to create ID Card for VIN ${vin}: ${(err as Error).message}`);
    return null;
  }
}

export async function createIDCardForExistingVehicle(
  page: Page,
  vin: string,
  effectiveDate: string,
  policyNumber: string
): Promise<string | null> {
  return createIDCard(page, vin, effectiveDate, policyNumber);
}
