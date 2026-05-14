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
import { screenshot } from '../browser/browserManager';

function normalizeDateValue(value: string): string {
  const parts = value.split(/[^\d]/).filter(Boolean);
  if (parts.length !== 3) return value.trim();
  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  return `${month}/${day}/${parts[2]}`;
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

  // Abrir el menú Actions y leer el href del link "Edit" — luego navegamos
  // directo via page.goto(). Clickear el link mantiene estado SPA del Momentum
  // wrapper que puede confundir a PDF.js y dejarlo atorado en "Rendering 98%".
  const actionsLi = templateRow.locator('li[aria-label="..."]').first();
  await actionsLi.click();
  await page.waitForTimeout(1000);

  const editLink = page.locator('.k-animation-container .k-item a, .k-menu-popup .k-item a').filter({
    hasText: /^Edit$/i,
  }).first();
  const editHref = await editLink.getAttribute('href').catch(() => null);

  if (!editHref) {
    throw new Error('No se pudo obtener href del link Edit en el menú Actions del template');
  }

  // Navegación directa (full page load) en vez de click — evita estado residual
  // del Momentum SPA. Esperamos networkidle para que PDF.js termine de bootstrapping.
  await page.goto(editHref, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Verificación: esperamos a que el toolbar del editor aparezca antes de seguir
  await page.locator('.pdf-editor-toolbar-row, input[placeholder="Form Name"]').first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => logger.warn('openIdCardTemplate: toolbar del editor no apareció en 20s'));
}

/**
 * Espera a que PDF.js termine de renderizar el documento antes de interactuar.
 * NowCerts muestra un overlay tipo "Rendering PDF... XX%" mientras PDF.js trabaja.
 * Si tocamos los dropdowns mientras PDF.js está activo, dispara el popup
 * "An error occurred while opening the document" y deja el editor en mal estado.
 */
async function waitForPdfRender(page: Page): Promise<void> {
  // Esperar que el spinner / overlay de "Rendering" desaparezca
  await page.waitForFunction(
    () => {
      const doc = (globalThis as any).document;
      // Buscar spinners activos del PDF
      const spinners = doc.querySelectorAll('.ant-spin-spinning, .pdf-loading, [class*="rendering"]');
      // Buscar texto "Rendering" o "Loading" visible
      const loadingTexts = Array.from(doc.querySelectorAll('*')).filter((el: any) => {
        if (el.children.length > 0) return false;
        const txt = (el.textContent || '').trim();
        if (!/^Rendering|^Loading|please wait/i.test(txt)) return false;
        return el.offsetParent !== null;
      });
      return spinners.length === 0 && loadingTexts.length === 0;
    },
    { timeout: 30_000 }
  ).catch(() => {
    logger.warn('waitForPdfRender: PDF aún parece en render tras 30s — continuando de todos modos');
  });
  await page.waitForTimeout(1000);
}

async function openFormData(page: Page): Promise<void> {
  // NowCerts re-organized the PDF editor (May 2026): the form-data row is now visible
  // by default, and the visible Form Name input changed from #dataSource_formName
  // (now hidden inside ant-form-item-hidden) to input[placeholder="Form Name"] in
  // .pdf-editor-toolbar-row. Both inputs share React state.
  // The header toggle still exists and now collapses BOTH rows (toolbar + form-data).
  const formNameInput = page.locator('input[placeholder="Form Name"]').first();

  const alreadyVisible = await formNameInput.isVisible().catch(() => false);
  if (alreadyVisible) return;

  const headerToggle = page.locator('.pdf-editor-header-toggle').first();
  const legacyFormDataButton = page.locator('button[title="Toggle Form Data Panel"], button').filter({ hasText: /^Form Data$/i }).first();

  for (let attempt = 0; attempt < 3; attempt++) {
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
      await legacyFormDataButton.click({ force: true }).catch(async () => {
        await legacyFormDataButton.evaluate((el: any) => el.click());
      });
    }

    const visible = await formNameInput.waitFor({ state: 'visible', timeout: 7_000 }).then(() => true).catch(() => false);
    if (visible) return;

    logger.info(`openFormData: form-name input not visible after toggle (attempt ${attempt + 1}/3), retrying...`);
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

  // NowCerts SIEMPRE muestra un modal "Are you sure you want to save?" con botones
  // No / Yes después del click de Save (live confirmado 2026-05-04). Esperamos a que
  // aparezca el modal y clickeamos "Yes". Sin esto, el save no se confirma y el URL
  // queda en /Files/Insert.aspx en vez de redirigir a /PdfForms.
  const confirmYes = page.locator('.ant-modal button.ant-btn-primary').filter({ hasText: /^Yes$/i }).first();
  await confirmYes.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {
    logger.warn('saveIdCard: modal "Are you sure" no apareció en 10s');
  });

  if (await confirmYes.count() > 0 && await confirmYes.isVisible().catch(() => false)) {
    await confirmYes.click({ force: true }).catch(async () => {
      await confirmYes.evaluate((el: any) => el.click());
    });
  } else {
    logger.warn('saveIdCard: botón "Yes" no encontrado tras Save — el flujo puede no completarse');
  }

  // Tras el Yes, NowCerts redirige a /Insureds/Details/{id}/PdfForms.
  await page.waitForURL('**/PdfForms', { timeout: 30_000 }).catch(() => {
    logger.warn('saveIdCard: no redirigió a /PdfForms en 30s tras Yes');
  });
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

    // NowCerts migró el form de Vehículos de ASPX legacy a Angular/Momentum (live 2026-05-14).
    // La URL del Add New ahora es /AMSINS/Vehicles/Insert?parentId=... (ya no /Vehicles/Insert.aspx).
    const addNewLink = page.locator('a.action-insert').filter({ hasText: /\+ Add New/i }).first();
    await addNewLink.waitFor({ state: 'visible', timeout: 20_000 });
    const href = await addNewLink.getAttribute('href');
    if (href) {
      await page.goto(href, { waitUntil: 'domcontentloaded' });
    } else {
      await addNewLink.click({ force: true });
    }
    await page.waitForURL('**/Vehicles/Insert**', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Helpers para los ng-selects de Angular. El form tiene 8 ng-selects visibles
    // en este orden de DOM: 0=Type, 1=Year, 2=Usage, 3=Policies, 4=Lien Holder,
    // 5=Nature of Interest, 6=Drivers, 7=Garaging.
    const openNgSelect = async (index: number): Promise<void> => {
      const sel = page.locator('ng-select').nth(index);
      await sel.scrollIntoViewIfNeeded().catch(() => {});
      await sel.click({ force: true }).catch(async () => {
        await sel.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(700);
    };

    const selectNgOption = async (index: number, optionText: string, exact = false): Promise<boolean> => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        await openNgSelect(index);
        const matcher = exact
          ? new RegExp(`^${escapeRegex(optionText)}$`, 'i')
          : new RegExp(escapeRegex(optionText), 'i');
        const option = page.locator('ng-dropdown-panel .ng-option').filter({ hasText: matcher }).first();
        if (await option.count() > 0) {
          await option.click({ force: true }).catch(async () => {
            await option.evaluate((el: any) => el.click());
          });
          await page.waitForTimeout(500);
          return true;
        }
        logger.warn(`selectNgOption[${index}] no encontró "${optionText}" en intento ${attempt}/3`);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
      }
      return false;
    };

    const readNgValue = async (index: number): Promise<string> => {
      return await page.locator('ng-select').nth(index)
        .locator('.ng-value-label, .ng-value')
        .first()
        .textContent()
        // El icono × (clear) puede aparecer leading o trailing dependiendo del template
        .then(t => (t || '').replace(/×/g, '').trim())
        .catch(() => '');
    };

    // 1) Type (nth=0)
    await selectNgOption(0, inferVehicleType(cmd), true);

    // 2) VIN (placeholder)
    await page.fill('input[placeholder="VIN Number"]', cmd.vin);

    // 3) Check VIN — el botón ahora es <a class="btn btn-additional"> con texto "Check VIN"
    await page.locator('a.btn-additional').filter({ hasText: /^Check VIN$/i }).first().click({ force: true });
    await page.waitForTimeout(3500);

    // Esperar hasta 3 intentos a que el Year se autopobla
    let vinYear = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      vinYear = await readNgValue(1);
      if (vinYear) break;
      logger.warn(`addVehicle: Year vacío tras Check VIN (intento ${attempt}/3), esperando...`);
      await page.waitForTimeout(3000);
    }
    const vinMake = await page.locator('input[placeholder="Make"]').inputValue().catch(() => '');
    const vinModel = await page.locator('input[placeholder="Model"]').inputValue().catch(() => '');

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

    // 4) Year (nth=1) — override si el autofill no coincide
    if (vinYear !== cmd.year) {
      await selectNgOption(1, cmd.year, true);
    }

    // 5) Description (placeholder)
    await page.fill('input[placeholder="Description"]', cmd.description);

    // 6) Usage (nth=2)
    await selectNgOption(2, cmd.usage ?? 'Commercial', true);

    // 7) Value (placeholder, opcional)
    if (cmd.value) {
      await page.fill('input[placeholder="Value"]', cmd.value.replace(/[^0-9,.]/g, ''));
    }

    // 8) Save Changes — botón Angular
    const saveBtn = page.locator('button.btn-primary').filter({ hasText: /^Save Changes$/i }).first();
    await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
    await saveBtn.click({ force: true }).catch(async () => {
      await saveBtn.evaluate((el: any) => el.click());
    });
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
 * Espera a que un campo del PDF (input con name F[0].P1[0]....) se llene con
 * el valor esperado. NowCerts autofiltra el form al seleccionar Policy/Vehicle
 * en los ant-selects, pero el render del PDF puede tardar unos segundos. Si
 * pasamos a la siguiente acción demasiado pronto, NowCerts dispara el popup
 * "An error occurred while opening the document" y queda incompleto.
 */
async function waitForPdfFieldToPopulate(
  page: Page,
  selector: string,
  expectedSubstring: string,
  label: string
): Promise<void> {
  try {
    await page.waitForFunction(
      ({ sel, expected }) => {
        const doc = (globalThis as any).document;
        const input = doc?.querySelector(sel);
        return (input?.value || '').includes(expected);
      },
      { sel: selector, expected: expectedSubstring },
      { timeout: 12_000 }
    );
  } catch {
    logger.warn(`waitForPdfFieldToPopulate: ${label} no se llenó después de 12s — continuando`);
  }
}

/**
 * Dismisses any popup/modal that NowCerts may show after selecting policy+vehicle
 * in the ID Card form-data panel. Common case: an ant-modal that says
 * "Document did not load correctly" with an OK button. Without dismissing it,
 * the underlying PDF form fields don't auto-fill and downstream validation fails.
 */
async function dismissPopupsAfterPrefill(page: Page): Promise<void> {
  await page.waitForTimeout(800);

  // Native browser dialog (alert/confirm) — auto-accept any pending one.
  page.once('dialog', async (dialog) => {
    logger.info(`dismissPopupsAfterPrefill: native dialog "${dialog.message()}", accepting`);
    await dialog.accept().catch(() => {});
  });

  // Ant-modal popup (most common in this editor).
  const modalOk = page.locator(
    '.ant-modal:not([style*="display: none"]) .ant-modal-confirm-btns button.ant-btn-primary, ' +
    '.ant-modal:not([style*="display: none"]) .ant-modal-footer button.ant-btn-primary'
  ).first();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await modalOk.count() === 0) break;
    const visible = await modalOk.isVisible().catch(() => false);
    if (!visible) break;
    const modalText = await page.locator('.ant-modal:not([style*="display: none"]) .ant-modal-body').first().textContent().catch(() => '');
    logger.info(`dismissPopupsAfterPrefill: ant-modal detected ("${(modalText || '').trim().slice(0, 80)}"), clicking OK (attempt ${attempt + 1}/3)`);
    await modalOk.click({ force: true }).catch(async () => {
      await modalOk.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(500);
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

  // Crítico: esperar que PDF.js termine antes de tocar los ant-select.
  // Sin esto, el bot abre el dropdown mientras el PDF está renderizando y
  // dispara "An error occurred while opening the document".
  await waitForPdfRender(page);

  // Select policy first. Tras seleccionar la póliza, NowCerts dispara un re-render
  // del PDF y corre el autofill — si abrimos el dropdown del Vehicle antes de que
  // termine, dispara un popup "An error occurred while opening the document" que
  // deja el campo Policy_Number vacío. Por eso esperamos a que el campo del PDF
  // tenga el valor antes de seleccionar el vehículo.
  await selectAntOption(page, 0, new RegExp(`^${escapeRegex(policyNumber)}\\b`, 'i'));
  await waitForPdfFieldToPopulate(
    page,
    'input[name="F[0].P1[0].Policy_PolicyNumberIdentifier_A[0]"]',
    policyNumber,
    `policy ${policyNumber}`
  );

  await selectAntOption(page, 1, new RegExp(escapeRegex(vin), 'i'));
  await waitForPdfFieldToPopulate(
    page,
    'input[name="F[0].P1[0].Vehicle_VINIdentifier_A[0]"]',
    vin,
    `vin ${vin}`
  );

  // Por si NowCerts disparó el popup a pesar de la espera (caso degradado),
  // lo dismisseamos.
  await dismissPopupsAfterPrefill(page);

  // Now overwrite the form name with our target (e.g. "ID CARD VIN# 0022")
  // The visible input is in the toolbar row (placeholder "Form Name"); React syncs it
  // back to the hidden #dataSource_formName.
  // delay: 30ms — con 5ms el bot pierde caracteres ("DCAD VN 90" en vez de "ID CARD VIN# 8940")
  const formNameInput = page.locator('input[placeholder="Form Name"]').first();
  await formNameInput.click({ force: true }).catch(() => {});
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await formNameInput.pressSequentially(targetName, { delay: 30 });
  await formNameInput.evaluate((el: any) => el.blur()).catch(() => {});
  await page.waitForTimeout(300);

  // Verificación final: si el form name no quedó como esperábamos, forzar via JS.
  const currentFormName = await formNameInput.inputValue().catch(() => '');
  if (currentFormName !== targetName) {
    logger.warn(`Form name got "${currentFormName}" instead of "${targetName}", forcing via JS`);
    await formNameInput.evaluate((el: any, value: string) => {
      const win = (globalThis as any).window;
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(el, value);
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
    }, targetName);
    await page.waitForTimeout(200);
  }

  // Los campos visuales del PDF (F[0].P1[0]....) son meramente cosméticos.
  // El save real usa los hidden #dataSource_formName, #dataSource_policyIds y
  // #dataSource_vehicleIds — esos ya quedaron seteados por selectAntOption y el
  // form name fill. Si el PDF.js se queda atorado en "Rendering 98%" en headless,
  // los campos visuales no se llenan, pero el save sigue funcionando.
  //
  // Por eso: intentamos un fill cosmético de los campos visuales (best-effort,
  // sin fallar si están dead), y procedemos a guardar. La verificación real es
  // que el row aparezca en el grid Edited Forms después del save (eso lo hace
  // downloadFlattenedIdCard).
  const policyNumberField = page.locator('input[name="F[0].P1[0].Policy_PolicyNumberIdentifier_A[0]"]').first();
  const effectiveDateField = page.locator('input[name="F[0].P1[0].Policy_EffectiveDate_A[0]"]').first();
  const insuredNameField = page.locator('input[name="F[0].P1[0].NamedInsured_FullName_A[0]"]').first();
  const vinField = page.locator('input[name="F[0].P1[0].Vehicle_VINIdentifier_A[0]"]').first();

  // Best-effort fill de los campos visuales — no fallar si PDF.js está atorado.
  await policyNumberField.fill(policyNumber).catch(() => {});
  await vinField.fill(vin).catch(() => {});
  await effectiveDateField.fill(normalizeDateValue(effectiveDate)).catch(() => {});
  const rawInsuredName = await insuredNameField.inputValue().catch(() => '');
  await insuredNameField.fill(cleanClientName(rawInsuredName || '')).catch(() => {});

  // Verificar que los hidden dataSource * estén bien — esto sí es crítico para el save.
  const dataSourceState = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const formName = doc.querySelector('#dataSource_formName')?.value || '';
    // Las selecciones del policy/vehicle se reflejan en .ant-select-selection-item
    const policyChip = doc.querySelector('#pdf-prefill-filter-form .ant-select:nth-of-type(1) .ant-select-selection-item, #dataSource_policyIds')?.closest('.ant-select')?.querySelector('.ant-select-selection-item')?.textContent?.trim() || '';
    const vehicleChip = doc.querySelector('#pdf-prefill-filter-form .ant-select:nth-of-type(2) .ant-select-selection-item, #dataSource_vehicleIds')?.closest('.ant-select')?.querySelector('.ant-select-selection-item')?.textContent?.trim() || '';
    return { formName, policyChip, vehicleChip };
  }).catch(() => ({ formName: '', policyChip: '', vehicleChip: '' }));

  logger.info(`ID Card dataSource state: formName="${dataSourceState.formName}", policy="${dataSourceState.policyChip}", vehicle="${dataSourceState.vehicleChip}"`);

  if (!dataSourceState.policyChip.includes(policyNumber) || !dataSourceState.vehicleChip.includes(vin)) {
    throw new Error(`ID Card dataSource selections missing — policy chip "${dataSourceState.policyChip}", vehicle chip "${dataSourceState.vehicleChip}" (expected policy ${policyNumber}, vin ${vin})`);
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
