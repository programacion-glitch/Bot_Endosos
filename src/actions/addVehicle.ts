import { Page } from 'playwright';
import { AddPolicyCommand, AddVehicleCommand, ActionResult, Command } from '../types';
import { logger } from '../utils/logger';
import {
  buildInsuredUrl,
  cleanClientName,
  escapeRegex,
  fail,
  getInsuredIdFromUrl,
  getInsuredUrl,
  ok,
  todayYYYYMMdd,
  triggerDownload,
  waitForSaveConfirmation,
} from './_base';
import { selectRadComboByText } from './_policyHelpers';
import { screenshot } from '../browser/browserManager';

function normalizeDateValue(value: string): string {
  const parts = value.split(/[^\d]/).filter(Boolean);
  if (parts.length !== 3) return value.trim();
  return `${Number(parts[0])}/${Number(parts[1])}/${parts[2]}`;
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

/**
 * Result of looking up the AL policy for the ID Card.
 * - `policyNumber`: the policy number if found
 * - `noPolicyFound`: true if there's no AL policy at all (skip ID Card, valid case)
 * - `lookupFailed`: true if NowCerts didn't load (cannot determine, should be reported as failure)
 */
type IdCardPolicyLookup = {
  policyNumber: string | null;
  noPolicyFound: boolean;
  lookupFailed: boolean;
  error?: string;
};

async function resolveIdCardPolicyNumber(
  page: Page,
  cmd: AddVehicleCommand,
  commands: Command[]
): Promise<IdCardPolicyLookup> {
  // 1. Check if an AL policy was added in the current email
  const priorALPolicyNumber = getPriorALPolicyNumber(commands, cmd);
  if (priorALPolicyNumber) {
    return { policyNumber: priorALPolicyNumber, noPolicyFound: false, lookupFailed: false };
  }

  // 2. Search for an existing AL policy (Commercial Auto) on the insured's policies page
  // Retry navigation up to 2 times since NowCerts can be slow to load
  const policiesUrl = getInsuredUrl(page, 'Policies');
  let navError: string | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto(policiesUrl, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      await page.waitForTimeout(3000);
      navError = null;
      break;
    } catch (err) {
      navError = (err as Error).message;
      logger.warn(`resolveIdCardPolicyNumber: navigation to Policies failed (attempt ${attempt}/2): ${navError}`);
      if (attempt < 2) await page.waitForTimeout(5000);
    }
  }

  if (navError) {
    return { policyNumber: null, noPolicyFound: false, lookupFailed: true, error: `Could not load Policies page: ${navError}` };
  }

  try {
    // Find rows in the policies grid that have "Commercial Auto" in the Lines of Business column
    const rows = page.locator('[role="grid"] [role="row"]');
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const lobCell = row.locator('[role="gridcell"]').filter({ hasText: /Commercial\s*Auto/i }).first();
      if (await lobCell.count() > 0) {
        const policyLink = row.locator('[role="gridcell"] a[href*="/Policies/Details/"]').first();
        if (await policyLink.count() > 0) {
          const policyNumber = (await policyLink.textContent() ?? '').trim();
          if (policyNumber) {
            logger.info(`Found existing AL policy in NowCerts: ${policyNumber}`);
            return { policyNumber, noPolicyFound: false, lookupFailed: false };
          }
        }
      }
    }

    logger.info(`createIDCard: no existing AL policy found for VIN ${cmd.vin}`);
    return { policyNumber: null, noPolicyFound: true, lookupFailed: false };
  } catch (err) {
    return { policyNumber: null, noPolicyFound: false, lookupFailed: true, error: (err as Error).message };
  }
}

/**
 * Clicks an ant-select dropdown by index and selects an option matching `matcher`.
 *
 * Strategy: ant-select dropdowns can be slow to populate. We retry up to 4 times,
 * toggling the dropdown off/on between attempts to force the data to reload.
 */
async function selectAntOption(page: Page, selectIndex: number, matcher: RegExp): Promise<void> {
  const select = page.locator('.ant-select').nth(selectIndex);
  await select.scrollIntoViewIfNeeded().catch(() => {});

  for (let attempt = 1; attempt <= 4; attempt++) {
    // Open the dropdown
    await select.click({ force: true }).catch(async () => {
      await select.evaluate((el: any) => el.click());
    });
    // Progressive wait: 1.5s, 2.5s, 3.5s, 4.5s
    await page.waitForTimeout(500 + attempt * 1000);

    // Look for any options at all in the dropdown
    const allOptions = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option');
    const optionCount = await allOptions.count();

    // Filter out empty options (placeholders / loading states)
    const allTexts = optionCount > 0 ? await allOptions.allTextContents() : [];
    const nonEmptyCount = allTexts.filter(t => t.trim().length > 0).length;

    logger.info(`selectAntOption[${selectIndex}]: attempt ${attempt}/4 — found ${optionCount} options (${nonEmptyCount} non-empty)${nonEmptyCount > 0 ? ': ' + allTexts.filter(t => t.trim()).slice(0, 3).map(t => `"${t.trim()}"`).join(', ') : ''}`);

    if (nonEmptyCount === 0) {
      logger.warn(`selectAntOption[${selectIndex}]: dropdown empty on attempt ${attempt}/4, toggling off/on...`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
      await page.locator('body').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }

    // Try to find the matching option
    const option = allOptions.filter({ hasText: matcher }).first();
    if (await option.count() === 0) {
      logger.warn(`selectAntOption[${selectIndex}]: no option matching ${matcher} on attempt ${attempt}/4, retrying...`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
      await page.locator('body').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }

    // Found it — click and finish
    await option.click({ force: true }).catch(async () => {
      await option.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape').catch(() => {});
    return;
  }

  throw new Error(`ID Card option not found after 4 attempts: ${matcher}`);
}

/**
 * Creates a new ID Card from the "ID CARD VIN#" template in the All Forms grid.
 *
 * Manual flow (confirmed via Playwright MCP 2026-04-01):
 * 1. Navigate to PdfForms page
 * 2. Search "ID CARD" in the All Forms grid (second grid, nth(1))
 * 3. Find the "ID CARD VIN#" template row
 * 4. Click Actions (kendo menu li[aria-label="..."]) -> Edit
 * 5. This navigates to /Files/Insert.aspx (creates a new form from the template)
 * 6. The form name defaults to "ID CARD VIN# (MM/DD/YYYY)" with today's date
 * 7. Click "Form Data" button to open the data panel
 * 8. In Form Data: change name, select policy, select vehicle
 * 9. Save and download
 */
async function openIdCardTemplate(page: Page): Promise<void> {
  const pdfFormsUrl = getInsuredUrl(page, 'PdfForms');
  await page.goto(pdfFormsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Search for "ID CARD" in the All Forms grid (second search box)
  const allFormsSearchName = page.locator('input[placeholder="Name"]').nth(1);
  await allFormsSearchName.fill('ID CARD');

  const allFormsSearchButton = page.getByRole('button', { name: 'Search' }).nth(1);
  await allFormsSearchButton.click({ force: true });
  await page.waitForTimeout(2000);

  // Find the "ID CARD VIN#" template in All Forms grid (second grid)
  const allFormsGrid = page.locator('[role="grid"]').nth(1);
  const templateRow = allFormsGrid.locator('tr').filter({ hasText: /ID CARD VIN#/i }).first();

  if (await templateRow.count() === 0) {
    throw new Error('ID CARD VIN# template not found in All Forms');
  }
  await templateRow.waitFor({ state: 'visible', timeout: 15_000 });

  // Click Actions on the template row (kendo menu)
  const actionsLi = templateRow.locator('li[aria-label="..."]').first();
  await actionsLi.click();
  await page.waitForTimeout(1000);

  // Click Edit from the kendo popup menu
  const editItem = page.locator('.k-animation-container .k-item, .k-menu-popup .k-item').filter({
    hasText: /^Edit$/i,
  }).first();
  await editItem.click();

  // Wait for the PDF editor (Insert.aspx — creates a new form from the template)
  await page.waitForURL('**/Files/Insert.aspx**', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

async function openFormData(page: Page): Promise<void> {
  // NowCerts updated the PDF editor (April 2026): the old "Form Data" drawer button
  // was replaced by an inline toggle (.pdf-editor-header-toggle) that expands/collapses
  // a header panel containing the Form Name input and Policies/Vehicles dropdowns.
  const formNameInput = page.locator('#dataSource_formName');

  // First check if the panel is already expanded
  const alreadyVisible = await formNameInput.isVisible().catch(() => false);
  if (alreadyVisible) return;

  // New UI: toggle the collapsed header panel
  const headerToggle = page.locator('.pdf-editor-header-toggle').first();
  // Legacy UI fallback: old "Form Data" button
  const legacyFormDataButton = page.locator('button[title="Toggle Form Data Panel"], button').filter({ hasText: /^Form Data$/i }).first();

  for (let attempt = 0; attempt < 3; attempt++) {
    // Try the new toggle first
    if (await headerToggle.count() > 0) {
      const isCollapsed = await headerToggle.evaluate(
        (el: any) => el.classList.contains('pdf-editor-header-toggle--collapsed')
      ).catch(() => true);
      if (isCollapsed) {
        await headerToggle.click({ force: true }).catch(async () => {
          await headerToggle.evaluate((el: any) => el.click());
        });
      }
    } else if (await legacyFormDataButton.count() > 0) {
      // Fallback: legacy "Form Data" drawer button
      await legacyFormDataButton.click({ force: true }).catch(async () => {
        await legacyFormDataButton.evaluate((el: any) => el.click());
      });
    }

    const visible = await formNameInput.waitFor({ state: 'visible', timeout: 7_000 }).then(() => true).catch(() => false);
    if (visible) return;

    logger.info(`openFormData: header panel not visible after toggle (attempt ${attempt + 1}/3), retrying...`);
    await page.waitForTimeout(1000);
  }

  throw new Error('Form Data header panel did not open after 3 attempts');
}

async function closeFormData(page: Page): Promise<void> {
  // New UI: collapse the header toggle if it's expanded
  const headerToggle = page.locator('.pdf-editor-header-toggle').first();
  if (await headerToggle.count() > 0) {
    const isExpanded = await headerToggle.evaluate(
      (el: any) => !el.classList.contains('pdf-editor-header-toggle--collapsed')
    ).catch(() => false);
    if (isExpanded) {
      await headerToggle.click({ force: true }).catch(async () => {
        await headerToggle.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(300);
    }
    return;
  }

  // Legacy UI fallback: ant-drawer close button
  const closeButton = page.locator('button.ant-drawer-close[aria-label="Close"]').first();
  if (await closeButton.count() > 0) {
    await closeButton.click({ force: true }).catch(async () => {
      await closeButton.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(300);
  }
}

async function saveIdCard(page: Page): Promise<void> {
  // No need to close the header panel — the Save button is always accessible in the new UI.
  // The Save button is an ant-btn-primary with exact text "Save".
  // Using ant-btn-primary class makes it stable against UI changes that don't touch the design system.
  // Selector matches: <button class="ant-btn ant-btn-primary ..."><span>Save</span></button>
  const saveButton = page.locator('button.ant-btn-primary').filter({ hasText: /^Save$/i }).first();

  // Wait for the button to be ready (it may take a moment after filling the form)
  await saveButton.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  await saveButton.scrollIntoViewIfNeeded().catch(() => {});
  await saveButton.click({ force: true }).catch(async () => {
    await saveButton.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(1000);

  // Confirm dialog if it appears
  const confirmYes = page.locator('button.ant-btn-primary, button').filter({ hasText: /^Yes$/i }).first();
  if (await confirmYes.count() > 0 && await confirmYes.isVisible().catch(() => false)) {
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
  // After Save, the new row may take a moment to appear in the Edited Forms grid.
  // Wait a few seconds and reload the PdfForms page to make sure we see the latest data.
  await page.waitForTimeout(5000);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);

  // Search in the Edited Forms grid (first grid) for the newly saved ID Card
  const editedFormsGrid = page.locator('[role="grid"]').first();
  const row = editedFormsGrid.locator('tr').filter({
    hasText: new RegExp(escapeRegex(targetName), 'i'),
  }).first();

  // Retry finding the row up to 3 times with reloads in between
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await row.count() > 0) break;
    logger.info(`downloadFlattenedIdCard: row "${targetName}" not found, reloading (attempt ${attempt + 1}/3)...`);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3000);
  }

  if (await row.count() === 0) {
    throw new Error(`ID Card row "${targetName}" not found in Edited Forms for download`);
  }
  await row.waitFor({ state: 'visible', timeout: 15_000 });

  const filename = `${today}_ID_CARD_VIN_${last4}.pdf`;

  return await triggerDownload(
    page,
    async () => {
      // Open the kendo Actions menu
      const actionsLi = row.locator('li[aria-label="..."]').first();
      await actionsLi.click();
      await page.waitForTimeout(1000);

      // Hover over "Download" in the kendo popup to open the submenu
      const downloadItem = page.locator('.k-animation-container .k-item, .k-menu-popup .k-item').filter({
        hasText: /^Download$/i,
      }).first();
      await downloadItem.hover();
      await page.waitForTimeout(1000);

      // Click "Flatten (not editable)" from the submenu
      const flattenItem = page.locator('.k-animation-container .k-item, .k-menu-popup .k-item').filter({
        hasText: /Flatten/i,
      }).first();
      await flattenItem.click();
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
        cmd.value.replace(/[^0-9,.]/g, '')
      );
    }

    await page.click('#btnInsert_input');
    await waitForSaveConfirmation(page);

    const files: string[] = [];
    const lookup = await resolveIdCardPolicyNumber(page, cmd, commands);

    // Case 1: lookup failed (NowCerts didn't load) — report as partial failure with screenshot
    if (lookup.lookupFailed) {
      const shotPath = await screenshot(page, `idcard_lookup_fail_${cmd.vin.slice(-4)}`).catch(() => undefined);
      const result = fail(
        'ADD_VEHICLE',
        `Vehicle VIN ${cmd.vin} was added, but could not verify if AL policy exists: ${lookup.error ?? 'unknown'}. ID Card was not created.`,
        new Error(lookup.error ?? 'Policy lookup failed')
      );
      if (shotPath) result.errorScreenshot = shotPath;
      result.downloadedFiles = files;
      return result;
    }

    // Case 2: AL policy found — try to create the ID Card
    if (lookup.policyNumber) {
      const idCardResult = await createIDCard(page, cmd.vin, cmd.effectiveDate, lookup.policyNumber);
      if (idCardResult.file) {
        files.push(idCardResult.file);
      } else {
        // ID Card was expected but failed — capture screenshot and report partial failure
        const shotPath = await screenshot(page, `idcard_fail_${cmd.vin.slice(-4)}`).catch(() => undefined);
        const result = fail(
          'ADD_VEHICLE',
          `Vehicle VIN ${cmd.vin} was added, but ID Card creation failed: ${idCardResult.error ?? 'unknown error'}`,
          new Error(idCardResult.error ?? 'ID Card creation failed')
        );
        if (shotPath) result.errorScreenshot = shotPath;
        result.downloadedFiles = files;
        return result;
      }
    }
    // Case 3: noPolicyFound — vehicle added without ID Card, that's a valid scenario

    return ok('ADD_VEHICLE', `Vehicle VIN ${cmd.vin} added successfully.`, files);
  } catch (err) {
    return fail('ADD_VEHICLE', (err as Error).message, err as Error);
  }
}

/**
 * Single attempt to create an ID Card.
 * Separated from retry logic so each attempt starts fresh.
 */
async function attemptCreateIDCard(
  page: Page,
  vin: string,
  effectiveDate: string,
  policyNumber: string,
  last4: string,
  today: string,
  targetName: string
): Promise<string> {
  await openIdCardTemplate(page);
  await openFormData(page);

  // Select policy and vehicle FIRST — selecting them may auto-regenerate the form name,
  // so we set the name AFTER to ensure it sticks.
  await selectAntOption(page, 0, new RegExp(`^${escapeRegex(policyNumber)}\\b`, 'i'));
  await selectAntOption(page, 1, new RegExp(escapeRegex(vin), 'i'));

  // Now overwrite the form name with our target (e.g. "ID CARD VIN# 0022")
  const formNameInput = page.locator('#dataSource_formName');
  await formNameInput.click({ force: true }).catch(() => {});
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await formNameInput.pressSequentially(targetName, { delay: 5 });
  await formNameInput.evaluate((el: any) => el.blur()).catch(() => {});
  await page.waitForTimeout(300);

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
}

/**
 * Result of an ID Card creation attempt.
 * - `file`: path to the downloaded PDF on success
 * - `error`: human-readable error message on failure
 */
type IdCardResult = { file: string | null; error?: string };

/**
 * Creates an ID Card for the newly added vehicle.
 * Retries up to 3 times if the ID Card creation fails (e.g. Form Data panel doesn't open).
 * The vehicle is already created — only the ID Card is retried.
 */
async function createIDCard(
  page: Page,
  vin: string,
  effectiveDate: string,
  policyNumber: string
): Promise<IdCardResult> {
  const last4 = vin.slice(-4);
  const today = todayYYYYMMdd();
  const targetName = `ID CARD VIN# ${last4}`;
  const MAX_RETRIES = 3;

  // Capture the insured ID NOW while the URL is still on the insured's page
  // (before navigating to Files/Insert.aspx which changes the URL)
  let insuredId: string;
  try {
    insuredId = getInsuredIdFromUrl(page);
  } catch {
    // Try to extract from current URL if it has TruckingCompanyId
    const match = page.url().match(/TruckingCompanyId=([0-9a-f-]{36})/i);
    insuredId = match?.[1] ?? '';
  }

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logger.info(`Creating ID Card for VIN: ${vin} using policy ${policyNumber} (attempt ${attempt}/${MAX_RETRIES})`);
    try {
      const file = await attemptCreateIDCard(page, vin, effectiveDate, policyNumber, last4, today, targetName);
      return { file };
    } catch (err) {
      lastError = (err as Error).message;
      logger.error(`ID Card attempt ${attempt}/${MAX_RETRIES} failed for VIN ${vin}: ${lastError}`);
      if (attempt < MAX_RETRIES) {
        logger.info(`Retrying ID Card creation for VIN ${vin}...`);
        // Navigate back to insured's PdfForms using the captured ID
        const pdfFormsUrl = insuredId
          ? buildInsuredUrl(insuredId, 'PdfForms')
          : getInsuredUrl(page, 'PdfForms');
        await page.goto(pdfFormsUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }
  }

  logger.error(`Failed to create ID Card for VIN ${vin} after ${MAX_RETRIES} attempts`);
  return { file: null, error: `Failed after ${MAX_RETRIES} attempts: ${lastError}` };
}

export async function createIDCardForExistingVehicle(
  page: Page,
  vin: string,
  effectiveDate: string,
  policyNumber: string
): Promise<string | null> {
  const result = await createIDCard(page, vin, effectiveDate, policyNumber);
  return result.file;
}
