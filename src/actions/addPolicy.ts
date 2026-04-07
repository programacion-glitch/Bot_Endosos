import { Page } from 'playwright';
import { AddPolicyCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { fail, ok, waitForSaveConfirmation, getInsuredUrl, escapeRegex, toDigits, byIdEndsWith } from './_base';
import {
  COVERAGES_VIEW, COVERAGES_ARROW, COVERAGES_REFRESH, COVERAGES_DROPDOWN, AL_SECTION_CHECKBOX,
  selectRadComboByText, setCheckboxById, ensureControlExists,
  fillCoverageText, waitForControlAttached, openCoveragesView,
  selectCoverageSection, refreshCoverageSections,
  enableAutomobileLiabilityCoverage,
} from './_policyHelpers';

const POLICY_ADD_NEW = 'a[href*="Policies/Insert.aspx"][href*="TruckingCompanyId"]';
const POLICY_NUMBER = '#ContentPlaceHolder1_FormView1_ctl01_ctl00___Number_TextBox1';
const EFFECTIVE_DATE = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl01___EffectiveDate_ceDate_dateInput';
const EXPIRATION_DATE = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl04___ExpirationDate_ceDate_dateInput';
const BUSINESS_TYPE_ARROW = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl07___BusinessType_ddlEnum_Arrow';
const CARRIER_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl11___TruckingCompany_ddlNAICs_Input';
const MGA_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl12___TruckingCompany2_ddlUnderwriters_Input';
const LOB_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptLinesOfBusiness_ctl00_usrLineOfBusiness_ddlLineOfBusinesses_Input';
const LOB_ADD = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptLinesOfBusiness_ctl00_lnkAddNew';
const CSL_ARROW = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_usrPolicyCoverages123_rcbLimitLiabilityCSL_Arrow';
const CSL_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_usrPolicyCoverages123_rcbLimitLiabilityCSL_Input';
const AL_COMBINED_SINGLE = '[id$="automobileLiability_txtCombinedSingle"]';
const SAVE_BUTTON = '#btnInsert_SaveChanges';
const MASTER_POLICIES_ARROW = '#ctl00_ContentPlaceHolder1_usrPoliciesMultiSelector_ddlPolicies_Arrow';
const MASTER_POLICIES_ITEMS = '#ctl00_ContentPlaceHolder1_usrPoliciesMultiSelector_ddlPolicies_DropDown li';
const MASTER_UPDATE_BUTTON = '#ctl00_ContentPlaceHolder1_btnUpdate_input';

const LOB_NAMES: Record<string, string> = {
  AL: 'Commercial Auto',
  NTL: 'Commercial Auto',
  MTC: 'Motor Truck Cargo',
  APD: 'Physical Damage',
  GL: 'General Liability',
  WC: "Worker's Compensation",
  EXL: 'Excess Liability',
};

const BUSINESS_TYPE_NAMES: Record<string, string> = {
  AL: 'New Business',
  NTL: 'New Business',
  MTC: 'New Business',
  APD: 'New Business',
  GL: 'New Business',
  WC: 'New Business',
  EXL: 'New Business',
};

const COVERAGE_SECTION_NAMES: Record<string, string> = {
  AL: 'Automobile Liability',
  NTL: 'Automobile Liability',
  MTC: 'Cargo',
  APD: 'Physical Damage',
  GL: 'General Liability',
  WC: 'Workers Compensation And Employers Liability',
  EXL: 'Excess/Umbrella Liability',
};

async function clickPoliciesAddNew(page: Page): Promise<void> {
  const policiesUrl = getInsuredUrl(page, 'Policies');
  await page.goto(policiesUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const addNew = page.locator(POLICY_ADD_NEW).first();
  await addNew.waitFor({ state: 'visible', timeout: 20_000 });
  await addNew.click({ force: true });
  await page.waitForURL('**/Policies/Insert.aspx**', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function chooseLOB(page: Page, lobName: string): Promise<void> {
  const lobInput = page.locator(LOB_INPUT).first();

  for (let attempt = 0; attempt < 3; attempt++) {
    await lobInput.fill(''); // Clear input explicitly
    await page.waitForTimeout(300);
    await lobInput.fill(lobName);
    await page.waitForTimeout(1000); // Allow list to render

    const dropdownList = page.locator(`${LOB_INPUT.replace('_Input', '_DropDown')} li.rcbItem`);
    await dropdownList.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

    const exact = dropdownList.filter({
      hasText: new RegExp(`^${escapeRegex(lobName)}$`, 'i'),
    }).first();
    const partial = dropdownList.filter({
      hasText: new RegExp(escapeRegex(lobName), 'i'),
    }).first();
    const first = dropdownList.first();

    const target = (await exact.count()) > 0 ? exact : (await partial.count()) > 0 ? partial : first;

    if (await target.count() > 0 && await target.isVisible().catch(() => false)) {
      await target.click({ force: true }).catch(async () => {
        await target.evaluate((el: any) => el.click());
      });
      await page.waitForTimeout(800);

      const selectedValue = await lobInput.inputValue().catch(() => '');
      if (new RegExp(`^${escapeRegex(lobName)}$`, 'i').test(selectedValue)) {
        await page.locator(LOB_ADD).click({ force: true });
        await page.waitForTimeout(2500);
        return;
      }
    }

    // Attempt failed, try to close dropdown and retry
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }

  throw new Error(`LOB not found or failed to select in dropdown: ${lobName}`);
}

async function fillAutomobileLiability(page: Page, cmd: AddPolicyCommand): Promise<void> {
  if (cmd.anyAuto) await setCheckboxById(page, byIdEndsWith('automobileLiability_cbAnyAuto'), true);
  if (cmd.allOwnedAutos) await setCheckboxById(page, byIdEndsWith('automobileLiability_cbAllOwnedAutos'), true);
  if (cmd.scheduledAutos) await setCheckboxById(page, byIdEndsWith('automobileLiability_cbScheduledAutos'), true);
  if (cmd.hiredAutos) await setCheckboxById(page, byIdEndsWith('automobileLiability_cbHiredAutos'), true);

  if (cmd.policyType === 'NTL') {
    // NTL: NON-OWNED AUTOS must be UNCHECKED.
    // "Non Trucking Liability" goes into the Other 1 row (cbOther1 + txtOther1).
    // Confirmed live 2026-03-13: the checkbox row below Non-Owned Autos is
    // cbOther1CoverageAutomobileLiability and its text input is
    // txtOther1CoverageAutomobileLiability — this is how the manual shows it.
    await setCheckboxById(page, byIdEndsWith('automobileLiability_cbNonOwnedAutos'), false);

    await setCheckboxById(page, byIdEndsWith('automobileLiability_cbOther1CoverageAutomobileLiability'), true);
    await page.waitForTimeout(300);

    const other1Text = page.locator(byIdEndsWith('automobileLiability_txtOther1CoverageAutomobileLiability')).first();
    await other1Text.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    // Try fill() first (works when visible), fall back to evaluate for hidden inputs
    const filled = await other1Text.fill('Non Trucking Liability').then(() => true).catch(() => false);
    if (!filled) {
      await other1Text.evaluate((el: any) => {
        el.value = 'Non Trucking Liability';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    await page.waitForTimeout(200);
  } else {
    // AL and other types: respect the nonOwnedAutos flag from the parsed email
    if (cmd.nonOwnedAutos) {
      await setCheckboxById(page, byIdEndsWith('automobileLiability_cbNonOwnedAutos'), true);
    }
  }

  const digits = toDigits(cmd.limit);
  if (digits) {
    await page.fill(AL_COMBINED_SINGLE, Number(digits).toLocaleString('en-US'));
    await page.waitForTimeout(300);
  }

  const cslLabel = mapLimitToCsl(cmd.limit);
  if (cslLabel) {
    await selectRadComboByText(page, CSL_ARROW, cslLabel).catch(() => {});
  }
}

async function fillMotorTruckCargo(page: Page, cmd: AddPolicyCommand): Promise<void> {
  await setCheckboxById(page, byIdEndsWith('cargoLiability_cbCargo'), true);
  await fillCoverageText(page, byIdEndsWith('cargoLiability_txtLimitPerVehicle'), cmd.limit);
  await fillCoverageText(page, byIdEndsWith('cargoLiability_txtDeductibleCargoLiability'), cmd.deductible);
}

async function fillGeneralLiability(page: Page, cmd: AddPolicyCommand): Promise<void> {
  await setCheckboxById(page, byIdEndsWith('generalLiability_cbGeneralLiability'), true);
  await setCheckboxById(page, byIdEndsWith('generalLiability_cbCommercial'), true);
  await setCheckboxById(page, byIdEndsWith('generalLiability_cbClaimsMade'), false);
  await setCheckboxById(page, byIdEndsWith('generalLiability_cbOccur'), true);
  await setCheckboxById(page, byIdEndsWith('generalLiability_cbPolicy'), true);
  await setCheckboxById(page, byIdEndsWith('generalLiability_cbProject'), false);
  await setCheckboxById(page, byIdEndsWith('generalLiability_cbLoc'), false);
  await setCheckboxById(page, byIdEndsWith('generalLiability_cbOtherGenAggregateLimitAppl'), false);

  await fillCoverageText(page, byIdEndsWith('generalLiability_txtEachOccurrence'), cmd.eachOccurrence);
  await fillCoverageText(page, byIdEndsWith('generalLiability_txtDamageToRented'), cmd.damageToRentedPremises);
  await fillCoverageText(page, byIdEndsWith('generalLiability_txtMedExp'), cmd.medExp);
  await fillCoverageText(page, byIdEndsWith('generalLiability_txtInjury'), cmd.personalAdvInjury);
  await fillCoverageText(page, byIdEndsWith('generalLiability_txtGeneralAgregate'), cmd.generalAggregate);
  await fillCoverageText(page, byIdEndsWith('generalLiability_txtProducts'), cmd.productsCompOpAgg);

  if (cmd.deductible) {
    // Label "Deductible" as text (not numeric) in Other1 Limits
    await ensureControlExists(page, byIdEndsWith('generalLiability_txtOther1LimitsGeneralLiability'));
    const labelInput = page.locator(byIdEndsWith('generalLiability_txtOther1LimitsGeneralLiability')).first();
    if (await labelInput.isVisible().catch(() => false)) {
      await labelInput.fill('Deductible');
    } else {
      await labelInput.evaluate((el: any) => {
        el.value = 'Deductible';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    await page.waitForTimeout(150);
    // Deductible value in Other2 Limits
    await fillCoverageText(page, byIdEndsWith('generalLiability_txtOther2LimitsGeneralLiability'), cmd.deductible);
  }
}

async function fillWorkersComp(page: Page, cmd: AddPolicyCommand): Promise<void> {
  await setCheckboxById(page, byIdEndsWith('workerCompAndEmployersLiability_cbWorkersCompensationAndEmployers'), true);
  await setCheckboxById(page, byIdEndsWith('workerCompAndEmployersLiability_cbWcStatutory'), true);
  await setCheckboxById(page, byIdEndsWith('workerCompAndEmployersLiability_cbOtherEmployerLiability'), false);

  await fillCoverageText(page, byIdEndsWith('workerCompAndEmployersLiability_txtEachAccident'), cmd.elEachAccident);
  await fillCoverageText(page, byIdEndsWith('workerCompAndEmployersLiability_txtEmployee'), cmd.elDiseaseEaEmployee);
  await fillCoverageText(page, byIdEndsWith('workerCompAndEmployersLiability_txtPolicyEmployerLiability'), cmd.elDiseasePolicyLimit);
}

async function fillExcessLiability(page: Page, cmd: AddPolicyCommand): Promise<void> {
  await setCheckboxById(page, byIdEndsWith('excessUmbrellaLiability_cbExcessUmbrellaLiability'), true);
  await fillCoverageText(page, byIdEndsWith('excessUmbrellaLiability_txtEachOccurrence'), cmd.eachOccurrence);
  await fillCoverageText(page, byIdEndsWith('excessUmbrellaLiability_txtAgregate'), cmd.aggregate);
}

/**
 * Navigates to the master certificate edit page and assigns the new policy.
 *
 * NOTE (2026-03-31): NowCerts updated the Certificates page from a Telerik RadWindow
 * popup (rwPopup iframe) to a full-page navigation. The "Edit" action now navigates
 * to /Certificates/Edit.aspx instead of opening an iframe popup.
 * The ASP.NET controls (policies dropdown, update button) remain the same on the edit page.
 */
async function assignPolicyToMasterCertificate(page: Page, certificatesUrl: string, cmd: AddPolicyCommand): Promise<void> {
  logger.info(`assignPolicyToMaster: navigating to certificates page`);
  await page.goto(certificatesUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const certRows = page.locator('table tbody tr').filter({
    has: page.locator('button, a, span').filter({ hasText: /Actions/i }),
  });
  const count = await certRows.count();
  logger.info(`assignPolicyToMaster: found ${count} certificate rows`);
  if (count === 0) {
    logger.info('No master certificate found — skipping policy assignment to master');
    return;
  }
  if (count > 1) {
    logger.warn(`Found ${count} master certificate rows — using the first one`);
  }

  const row = certRows.first();
  logger.info('assignPolicyToMaster: clicking Actions on master row');
  await row.locator('button, a, span').filter({ hasText: /Actions/i }).first().click({ force: true });
  await page.waitForTimeout(700);
  logger.info('assignPolicyToMaster: clicking Edit from kendo menu');
  await page.locator('.k-animation-container .k-item, .k-menu-popup .k-item').filter({ hasText: /^Edit$/i }).first().click();

  // Wait for the edit modal/page to load.
  // NowCerts may use either a full-page navigation or a modal popup (rwPopup iframe).
  let editContext: Page | ReturnType<typeof page.frame> = page;

  // Quick check: did it navigate to a full page?
  await page.waitForURL('**/Certificates/Edit.aspx**', { timeout: 5_000 }).catch(() => {});

  if (page.url().includes('/Certificates/Edit.aspx')) {
    logger.info(`assignPolicyToMaster: navigated to edit page`);
    await page.waitForTimeout(3000);
  } else {
    // It's a modal popup — wait for the rwPopup iframe to load with retries
    let found = false;
    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      await page.waitForTimeout(2000 + attempt * 1000);
      // Try rwPopup frame
      const frame = page.frame({ name: 'rwPopup' });
      if (frame) {
        const hasSelector = await frame.locator(MASTER_POLICIES_ARROW).count().catch(() => 0);
        if (hasSelector > 0) { editContext = frame; found = true; break; }
      }
      // Fallback: search all frames
      for (const f of page.frames()) {
        if (f === page.mainFrame()) continue;
        const has = await f.locator(MASTER_POLICIES_ARROW).count().catch(() => 0);
        if (has > 0) { editContext = f; found = true; break; }
      }
      if (!found) logger.info(`assignPolicyToMaster: modal not ready (attempt ${attempt + 1}/6)`);
    }
    if (!found) {
      throw new Error('Master certificate edit modal did not load after 6 attempts');
    }
    logger.info('assignPolicyToMaster: modal loaded');
  }

  // Wait for the policies selector to be ready
  const policiesArrow = editContext.locator(MASTER_POLICIES_ARROW).first();
  await policiesArrow.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});

  const labelText = `${cmd.policyNumber} (${cmd.effectiveDate}, ${LOB_NAMES[cmd.policyType]})`;
  logger.info(`assignPolicyToMaster: searching for policy — exact: "${labelText}", partial: "${cmd.policyNumber}"`);

  let selectedItem = false;
  for (let attempt = 0; attempt < 3 && !selectedItem; attempt++) {
    logger.info(`assignPolicyToMaster: opening dropdown (attempt ${attempt + 1})`);
    await policiesArrow.click({ force: true }).catch(async () => {
      await policiesArrow.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(800 + attempt * 500);

    const allItems = editContext.locator(MASTER_POLICIES_ITEMS);
    const itemCount = await allItems.count();

    if (itemCount === 0) {
      logger.warn(`assignPolicyToMaster: dropdown empty on attempt ${attempt + 1}, retrying...`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }

    if (attempt === 0) {
      for (let i = 0; i < itemCount; i++) {
        const text = await allItems.nth(i).textContent().catch(() => '');
        logger.info(`assignPolicyToMaster: dropdown item[${i}]: "${text?.trim()}"`);
      }
    }

    const exact = allItems.filter({ hasText: new RegExp(`^${escapeRegex(labelText)}$`, 'i') }).first();
    const partial = allItems.filter({ hasText: new RegExp(escapeRegex(cmd.policyNumber), 'i') }).first();
    const item = (await exact.count()) > 0 ? exact : partial;

    if (await item.count() === 0) {
      logger.warn(`assignPolicyToMaster: policy not found on attempt ${attempt + 1}, retrying...`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }

    const itemText = await item.textContent().catch(() => '');
    logger.info(`assignPolicyToMaster: selecting policy "${itemText?.trim()}"`);
    await item.locator('input[type="checkbox"]').evaluate((el: any) => el.click());
    // Close the dropdown so the selection registers properly
    await page.keyboard.press('Escape').catch(() => {});
    logger.info('assignPolicyToMaster: waiting 10s for selection to register...');
    await page.waitForTimeout(10_000);
    selectedItem = true;
  }

  if (!selectedItem) {
    throw new Error(`New policy not found in master certificate selector after 3 attempts: ${cmd.policyNumber}`);
  }

  const updateBtn = editContext.locator(MASTER_UPDATE_BUTTON).first();
  logger.info('assignPolicyToMaster: clicking Update button');
  await updateBtn.scrollIntoViewIfNeeded().catch(() => {});
  await updateBtn.evaluate((el: any) => el.click());
  // Wait for the save to complete
  await page.waitForTimeout(8000);
  logger.info('assignPolicyToMaster: done');
}

function mapLimitToCsl(limit?: string): string | null {
  const digits = toDigits(limit);
  if (!digits) return null;

  if (digits === '500000') return '500 CSL';
  if (digits === '1000000') return '1000 CSL';
  if (digits === '300000') return '300 CSL';
  if (digits === '250000') return '250 CSL';
  if (digits === '200000') return '200 CSL';
  if (digits === '100000') return '100 CSL';
  if (digits === '75000') return '75 CSL';
  return null;
}

async function validateSupportedPolicy(cmd: AddPolicyCommand): Promise<void> {
  if (!LOB_NAMES[cmd.policyType]) {
    throw new Error(`Unsupported policy type for addPolicy: ${cmd.policyType}. Supported: ${Object.keys(LOB_NAMES).join(', ')}`);
  }
}

async function fillPhysicalDamage(page: Page, cmd: AddPolicyCommand): Promise<void> {
  // Enable Physical Damage section
  await setCheckboxById(page, byIdEndsWith('PhisycalDamage_cbPhisycalDamage'), true);
  await page.waitForTimeout(500);

  // Set coverage type to "Comprehensive" (default for APD)
  const coverageArrow = byIdEndsWith('PhisycalDamage_ddlPhisycalDamageCoverage_Arrow');
  await selectRadComboByText(page, coverageArrow, 'Comprehensive').catch(() => {
    logger.warn('Could not select Comprehensive in Physical Damage dropdown');
  });

  // Fill deductible values
  if (cmd.deductible) {
    await fillCoverageText(page, byIdEndsWith('PhisycalDamage_txtPhisycalDamageCoverage'), cmd.deductible);
    await fillCoverageText(page, byIdEndsWith('PhisycalDamage_txtPhisycalDamageLimit'), cmd.deductible);
  }
}

export async function addPolicy(page: Page, cmd: AddPolicyCommand): Promise<ActionResult> {
  logger.info(`addPolicy: ${cmd.policyType} #${cmd.policyNumber}`);

  try {
    await validateSupportedPolicy(cmd);

    const certificatesUrl = getInsuredUrl(page, 'Certificates');

    await clickPoliciesAddNew(page);

    await page.fill(POLICY_NUMBER, cmd.policyNumber);
    await page.fill(EFFECTIVE_DATE, cmd.effectiveDate);
    await page.fill(EXPIRATION_DATE, cmd.expirationDate);

    const businessType = BUSINESS_TYPE_NAMES[cmd.policyType] ?? 'New Business';
    await selectRadComboByText(page, BUSINESS_TYPE_ARROW, businessType);

    // Carrier: type to filter and select from RadComboBox dropdown
    await page.fill(CARRIER_INPUT, cmd.carrier);
    await page.waitForTimeout(1000);
    const carrierDropdown = page.locator(`${CARRIER_INPUT.replace('_Input', '_DropDown')} li.rcbItem`);
    const carrierOption = carrierDropdown.filter({ hasText: new RegExp(escapeRegex(cmd.carrier), 'i') }).first();
    if (await carrierOption.count() > 0 && await carrierOption.isVisible().catch(() => false)) {
      await carrierOption.click({ force: true });
      await page.waitForTimeout(500);
    }

    // MGA: type to filter and select from RadComboBox dropdown
    await page.fill(MGA_INPUT, cmd.mga);
    await page.waitForTimeout(1000);
    const mgaDropdown = page.locator(`${MGA_INPUT.replace('_Input', '_DropDown')} li.rcbItem`);
    const mgaOption = mgaDropdown.filter({ hasText: new RegExp(escapeRegex(cmd.mga), 'i') }).first();
    if (await mgaOption.count() > 0 && await mgaOption.isVisible().catch(() => false)) {
      await mgaOption.click({ force: true });
      await page.waitForTimeout(500);
    } else {
      logger.warn(`MGA option not found in dropdown for: "${cmd.mga}"`);
    }
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const g = globalThis as any;
      g.window.scrollTo(0, g.document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(800);

    const lobName = LOB_NAMES[cmd.policyType]!;
    await chooseLOB(page, lobName);

    await openCoveragesView(page);
    await selectCoverageSection(page, COVERAGE_SECTION_NAMES[cmd.policyType]);
    await refreshCoverageSections(page);

    if (cmd.policyType === 'AL' || cmd.policyType === 'NTL') {
      await enableAutomobileLiabilityCoverage(page);
      await fillAutomobileLiability(page, cmd);
    }

    if (cmd.policyType === 'MTC') {
      await fillMotorTruckCargo(page, cmd);
    }

    if (cmd.policyType === 'GL') {
      await fillGeneralLiability(page, cmd);
    }

    if (cmd.policyType === 'WC') {
      await fillWorkersComp(page, cmd);
    }

    if (cmd.policyType === 'EXL') {
      await fillExcessLiability(page, cmd);
    }

    if (cmd.policyType === 'APD') {
      // Debug: dump ALL inputs with IDs to find APD controls
      const allInputs = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const inputs = Array.from(doc.querySelectorAll('input, select, textarea')) as any[];
        return inputs.map((el: any) => `${el.tagName}#${el.id || '(no-id)'}[type=${el.type || 'n/a'}]`)
          .filter((s: string) => s.includes('Damage') || s.includes('damage') || s.includes('hisycal') || s.includes('hysical') || s.includes('Cargo') || s.includes('cargo'));
      });
      logger.info(`APD debug: damage/physical/cargo related inputs (${allInputs.length}):\n${allInputs.join('\n')}`);
      // Also check the HTML around the coverages section
      const coveragesHtml = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const section = doc.querySelector('[id*="LinesOfBusinessAndFees_usrPolicyCoverages"]')
          || doc.querySelector('[id*="LinesOfBusinessAndFees_rptManageCoverages"]');
        return section ? section.innerHTML.substring(0, 3000) : 'coverages section not found';
      });
      logger.info(`APD debug: coverages HTML preview:\n${coveragesHtml.substring(0, 2000)}`);
      await fillPhysicalDamage(page, cmd);
    }

    const cslValue = await page.locator(CSL_INPUT).inputValue().catch(() => '');
    logger.info(`addPolicy: CSL selection = ${cslValue || 'n/a'}`);

    await page.locator(SAVE_BUTTON).click({ force: true });
    await waitForSaveConfirmation(page);

    await assignPolicyToMasterCertificate(page, certificatesUrl, cmd);

    return ok('ADD_POLICY', `Policy ${cmd.policyType} #${cmd.policyNumber} added.`);
  } catch (err) {
    return fail('ADD_POLICY', (err as Error).message, err as Error);
  }
}
