import { Page } from 'playwright';
import { UpdateLimitDeductibleCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, getInsuredIdFromUrl, buildInsuredUrl, LINE_LABELS, byIdEndsWith } from './_base';
import { openCoveragesView, fillCoverageText, resolvePolicyEditUrl, saveMaster } from './_policyHelpers';

/**
 * UPDATE LIMIT / DEDUCTIBLE
 * 1. Save the insured ID from the current URL
 * 2. Find the policy row in the Policies page grid
 * 3. Extract policy ID from the detail link and navigate to Edit.aspx
 * 4. Open coverages view and fill in the coverage fields
 * 5. Save the policy
 * 6. Navigate to Certificates and save the master certificate
 */
export async function updateLimitDeductible(
  page: Page,
  cmd: UpdateLimitDeductibleCommand
): Promise<ActionResult> {
  logger.info(`updateLimitDeductible: ${cmd.policyType}`);

  try {
    const policyLabel = LINE_LABELS[cmd.policyType];
    if (!policyLabel) {
      throw new Error(`Unsupported policy type: ${cmd.policyType}`);
    }

    // Save insured ID before navigating away
    const insuredId = getInsuredIdFromUrl(page);

    const editUrl = await resolvePolicyEditUrl(page, insuredId, policyLabel);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    // Open coverages section
    await openCoveragesView(page);

    const pt = cmd.policyType;

    if (pt === 'AL' || pt === 'NTL') {
      await fillCoverageText(page, byIdEndsWith('automobileLiability_txtCombinedSingle'), cmd.limit);

    } else if (pt === 'MTC') {
      await fillCoverageText(page, byIdEndsWith('cargoLiability_txtLimitPerVehicle'), cmd.limit);
      await fillCoverageText(page, byIdEndsWith('cargoLiability_txtDeductibleCargoLiability'), cmd.deductible);

    } else if (pt === 'APD') {
      // Physical Damage - NowCerts uses the typo "Phisycal" in their IDs
      await fillCoverageText(page, byIdEndsWith('PhisycalDamage_txtPhisycalDamageCoverage'), cmd.deductible);
      await fillCoverageText(page, byIdEndsWith('PhisycalDamage_txtPhisycalDamageLimit'), cmd.deductible);

    } else if (pt === 'GL') {
      await fillCoverageText(page, byIdEndsWith('generalLiability_txtEachOccurrence'), cmd.eachOccurrence);
      await fillCoverageText(page, byIdEndsWith('generalLiability_txtDamageToRented'), cmd.damageToRentedPremises);
      await fillCoverageText(page, byIdEndsWith('generalLiability_txtMedExp'), cmd.medExp);
      await fillCoverageText(page, byIdEndsWith('generalLiability_txtInjury'), cmd.personalAdvInjury);
      await fillCoverageText(page, byIdEndsWith('generalLiability_txtGeneralAgregate'), cmd.generalAggregate);
      await fillCoverageText(page, byIdEndsWith('generalLiability_txtProducts'), cmd.productsCompOpAgg);
      if (cmd.deductible) {
        await fillCoverageText(page, byIdEndsWith('generalLiability_txtOther1LimitsGeneralLiability'), 'Deductible');
        await fillCoverageText(page, byIdEndsWith('generalLiability_txtOther2LimitsGeneralLiability'), cmd.deductible);
      }

    } else if (pt === 'WC') {
      await fillCoverageText(page, byIdEndsWith('workerCompAndEmployersLiability_txtEachAccident'), cmd.elEachAccident);
      await fillCoverageText(page, byIdEndsWith('workerCompAndEmployersLiability_txtEmployee'), cmd.elDiseaseEaEmployee);
      await fillCoverageText(page, byIdEndsWith('workerCompAndEmployersLiability_txtPolicyEmployerLiability'), cmd.elDiseasePolicyLimit);

    } else if (pt === 'EXL') {
      await fillCoverageText(page, byIdEndsWith('generalLiability_txtEachOccurrence'), cmd.eachOccurrence);
      await fillCoverageText(page, byIdEndsWith('generalLiability_txtGeneralAgregate'), cmd.aggregate);
    }

    // Save the policy
    await page.locator('#btnUpdateGlobalPolicies').click({ force: true });
    await page.waitForTimeout(5000);

    // Navigate to Certificates and save master
    await page.goto(buildInsuredUrl(insuredId, 'Certificates'), {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);
    await saveMaster(page);

    return ok('UPDATE_LIMIT_DEDUCTIBLE', `Limits/deductibles updated for ${cmd.policyType}.`);
  } catch (err) {
    return fail('UPDATE_LIMIT_DEDUCTIBLE', (err as Error).message, err as Error);
  }
}
