import { Page } from 'playwright';
import { AddPolicyCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { fail, ok, waitForSaveConfirmation, getInsuredUrl } from './_base';

const POLICY_ADD_NEW = 'a[href*="Policies/Insert.aspx"][href*="TruckingCompanyId"]';
const POLICY_NUMBER = '#ContentPlaceHolder1_FormView1_ctl01_ctl00___Number_TextBox1';
const EFFECTIVE_DATE = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl01___EffectiveDate_ceDate_dateInput';
const EXPIRATION_DATE = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl04___ExpirationDate_ceDate_dateInput';
const BUSINESS_TYPE_ARROW = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl07___BusinessType_ddlEnum_Arrow';
const CARRIER_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl11___TruckingCompany_ddlNAICs_Input';
const MGA_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl12___TruckingCompany2_ddlUnderwriters_Input';
const LOB_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptLinesOfBusiness_ctl00_usrLineOfBusiness_ddlLineOfBusinesses_Input';
const LOB_ADD = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptLinesOfBusiness_ctl00_lnkAddNew';
const COVERAGES_VIEW = 'div.ibox:has(h4:text-is("Coverages")) span.label.state';
const COVERAGES_ARROW = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_Arrow';
const COVERAGES_REFRESH = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_btnRefreshSections';
const COVERAGES_DROPDOWN = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_DropDown li';
const COVERAGES_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_Input';
const COVERAGES_CLIENT_STATE = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_ClientState';
const CSL_ARROW = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_usrPolicyCoverages123_rcbLimitLiabilityCSL_Arrow';
const CSL_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_usrPolicyCoverages123_rcbLimitLiabilityCSL_Input';
const AL_SECTION_CHECKBOX = '[id$="automobileLiability_cbAutomobileLiability"]';
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function byIdEndsWith(suffix: string): string {
  return `[id$="${suffix}"]`;
}

function toDigits(value?: string): string {
  return (value ?? '').replace(/[^\d]/g, '');
}

async function selectRadComboByText(page: Page, arrowSelector: string, text: string): Promise<boolean> {
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

async function openCoveragesView(page: Page): Promise<void> {
  const view = page.locator(COVERAGES_VIEW).filter({ hasText: /^View$/i }).first();
  if (await view.count() > 0) {
    await view.click({ force: true }).catch(async () => {
      await view.evaluate((el: any) => el.click());
    });
    await page.waitForTimeout(1500);
  }
}

async function selectCoverageSection(page: Page, sectionName: string): Promise<void> {
  // Open the dropdown arrow
  const arrow = page.locator(COVERAGES_ARROW).first();
  await arrow.click({ force: true }).catch(async () => {
    await arrow.evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(1200);

  // Use pure DOM evaluate — isVisible() is unreliable for RadComboBox items.
  // Find the li whose text starts with sectionName and ensure its checkbox is checked.
  const result = await page.evaluate((name: string) => {
    const doc = (globalThis as any).document;
    const items: any[] = Array.from(
      doc.querySelectorAll(
        '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptManageCoverages_ctl00_usrCoveragesSelector_ddlCoveragesSections_DropDown li'
      )
    );
    const lower = name.toLowerCase();
    const target = items.find((li: any) => {
      const t = (li.textContent || '').toLowerCase();
      return t.startsWith(lower) || t.includes(lower);
    });
    if (!target) return { found: false, texts: items.map((li: any) => (li.textContent || '').trim()) };
    const cb: any = target.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
    return { found: true, alreadyChecked: !!(cb && cb.checked) };
  }, sectionName);

  if (!result.found) {
    logger.warn(`Coverage section not found: ${sectionName}. Available: ${(result as any).texts?.join(' | ')}`);
    // Close dropdown and throw
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
    throw new Error(`Coverage section not found: ${sectionName}`);
  }

  logger.info(`Coverage section "${sectionName}" selected (alreadyChecked=${(result as any).alreadyChecked})`);

  // Close the dropdown
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

async function refreshCoverageSections(page: Page): Promise<void> {
  await page.locator(COVERAGES_REFRESH).evaluate((el: any) => el.click());
  await page.waitForTimeout(2500);
}

async function waitForControlAttached(page: Page, selector: string, timeout = 10000): Promise<boolean> {
  return await page.waitForFunction(
    (sel) => {
      const doc = (globalThis as any).document;
      return !!doc?.querySelector?.(sel);
    },
    selector,
    { timeout }
  ).then(() => true).catch(() => false);
}

async function ensureControlExists(page: Page, selector: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const input = page.locator(selector).first();
    if (await input.count() > 0) {
      return;
    }

    await openCoveragesView(page);
    await page.waitForTimeout(900);
  }

  const input = page.locator(selector).first();
  if (await input.count() === 0) {
    throw new Error(`Control not found: ${selector}`);
  }
}

async function setCheckboxById(page: Page, selector: string, checked: boolean): Promise<void> {
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

async function fillCoverageText(page: Page, selector: string, value?: string): Promise<void> {
  if (!value) return;
  await ensureControlExists(page, selector);
  const input = page.locator(selector).first();
  const formatted = Number(toDigits(value)).toLocaleString('en-US');
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

async function enableAutomobileLiabilityCoverage(page: Page): Promise<void> {
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

async function setChecked(page: Page, selector: string, value: boolean): Promise<void> {
  if (!value) return;
  await setCheckboxById(page, selector, true);
}

async function fillAutomobileLiability(page: Page, cmd: AddPolicyCommand): Promise<void> {
  await setChecked(page, byIdEndsWith('automobileLiability_cbAnyAuto'), !!cmd.anyAuto);
  await setChecked(page, byIdEndsWith('automobileLiability_cbAllOwnedAutos'), !!cmd.allOwnedAutos);
  await setChecked(page, byIdEndsWith('automobileLiability_cbScheduledAutos'), !!cmd.scheduledAutos);
  await setChecked(page, byIdEndsWith('automobileLiability_cbHiredAutos'), !!cmd.hiredAutos);

  if (cmd.policyType === 'NTL') {
    // NTL: NON-OWNED AUTOS must be UNCHECKED.
    // "Non Trucking Liability" goes into the Other 1 row (cbOther1 + txtOther1).
    // Confirmed live 2026-03-13: the checkbox row below Non-Owned Autos is
    // cbOther1CoverageAutomobileLiability and its text input is
    // txtOther1CoverageAutomobileLiability — this is how the manual shows it.
    await setCheckboxById(page, byIdEndsWith('automobileLiability_cbNonOwnedAutos'), false);

    await setChecked(page, byIdEndsWith('automobileLiability_cbOther1CoverageAutomobileLiability'), true);
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
      await setChecked(page, byIdEndsWith('automobileLiability_cbNonOwnedAutos'), true);
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
    await setCheckboxById(page, byIdEndsWith('generalLiability_cbOther1CoverageGeneralLiability'), true);
    await page.locator(byIdEndsWith('generalLiability_txtOther1CoverageGeneralLiability')).first().fill('Deductible');
    await fillCoverageText(page, byIdEndsWith('generalLiability_txtOther1LimitsGeneralLiability'), cmd.deductible);
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

function assertValidatedCoverageSupport(cmd: AddPolicyCommand): void {
  if (cmd.policyType === 'APD' && cmd.deductible) {
    throw new Error('APD comprehensive/collision deductible fields are still not validated live in NowCerts.');
  }
  if (cmd.policyType === 'EXL' && (cmd.eachOccurrence || cmd.aggregate)) {
    throw new Error('EXL occurrence/aggregate fields are still not validated live in NowCerts.');
  }
}

async function assignPolicyToMasterCertificate(page: Page, certificatesUrl: string, cmd: AddPolicyCommand): Promise<void> {
  await page.goto(certificatesUrl, { waitUntil: 'domcontentloaded' });
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

  const arrow = frame.locator(MASTER_POLICIES_ARROW).first();
  await arrow.click({ force: true }).catch(async () => {
    await arrow.evaluate((el: any) => el.click());
  });
  await frame.waitForTimeout(500);

  const labelText = `${cmd.policyNumber} (${cmd.effectiveDate}, ${LOB_NAMES[cmd.policyType]})`;
  const exact = frame.locator(MASTER_POLICIES_ITEMS).filter({
    hasText: new RegExp(`^${escapeRegex(labelText)}$`, 'i'),
  }).first();
  const partial = frame.locator(MASTER_POLICIES_ITEMS).filter({
    hasText: new RegExp(escapeRegex(cmd.policyNumber), 'i'),
  }).first();
  const item = (await exact.count()) > 0 ? exact : partial;
  if (await item.count() === 0) {
    throw new Error(`New policy not found in master certificate selector: ${cmd.policyNumber}`);
  }

  await item.locator('input[type="checkbox"]').evaluate((el: any) => el.click());
  await frame.waitForTimeout(300);

  const updateBtn = frame.locator(MASTER_UPDATE_BUTTON).first();
  await updateBtn.scrollIntoViewIfNeeded().catch(() => {});
  await updateBtn.evaluate((el: any) => el.click());
  await page.waitForTimeout(5000);
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

export async function addPolicy(page: Page, cmd: AddPolicyCommand): Promise<ActionResult> {
  logger.info(`addPolicy: ${cmd.policyType} #${cmd.policyNumber}`);

  try {
    await validateSupportedPolicy(cmd);
    assertValidatedCoverageSupport(cmd);

    const certificatesUrl = getInsuredUrl(page, 'Certificates');

    await clickPoliciesAddNew(page);

    await page.fill(POLICY_NUMBER, cmd.policyNumber);
    await page.fill(EFFECTIVE_DATE, cmd.effectiveDate);
    await page.fill(EXPIRATION_DATE, cmd.expirationDate);

    const businessType = BUSINESS_TYPE_NAMES[cmd.policyType] ?? 'New Business';
    await selectRadComboByText(page, BUSINESS_TYPE_ARROW, businessType);

    await page.fill(CARRIER_INPUT, cmd.carrier);
    await page.waitForTimeout(500);
    await page.fill(MGA_INPUT, cmd.mga);
    await page.waitForTimeout(800);

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
