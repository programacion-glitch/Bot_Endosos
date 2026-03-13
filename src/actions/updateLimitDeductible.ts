import { Page } from 'playwright';
import { UpdateLimitDeductibleCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, waitForSaveConfirmation } from './_base';

const LINE_LABELS: Record<string, string> = {
  AL: 'Commercial Auto',
  MTC: 'Motor Truck Cargo',
  APD: 'Physical Damage',
  GL: 'General Liability',
  WC: "Worker's Compensation",
  EXL: 'Excess Liability',
  NTL: 'Commercial Auto',
};

/**
 * UPDATE LIMIT / DEDUCTIBLE
 */
export async function updateLimitDeductible(
  page: Page,
  cmd: UpdateLimitDeductibleCommand
): Promise<ActionResult> {
  logger.info(`updateLimitDeductible: ${cmd.policyType}`);

  try {
    // Find the policy row and edit
    const policyLabel = LINE_LABELS[cmd.policyType];
    // TODO: Confirm policy row selector
    const row = page.locator(`tr:has-text("${policyLabel}")`).first();
    // Click the pencil/edit button on the policy row
    await row.locator('button.edit-btn, a.edit-link, .pencil-icon').click();
    await page.waitForLoadState('networkidle');

    // Coverages -> view
    await page.click('button:text("view"), a:text("view")');
    await page.waitForLoadState('networkidle');

    const pt = cmd.policyType;

    if (pt === 'AL' || pt === 'NTL') {
      if (cmd.limit) await page.fill('input[name="CombinedSingleLimit"], input[name="Limit"]', cmd.limit);

    } else if (pt === 'MTC') {
      if (cmd.limit) await page.fill('input[name="Limit"]', cmd.limit);
      if (cmd.deductible) await page.fill('input[name="Deductible"]', cmd.deductible);

    } else if (pt === 'APD') {
      if (cmd.deductible) {
        await page.fill('input[name="ComprehensiveDeductible"]', cmd.deductible).catch(() => {});
        await page.fill('input[name="CollisionDeductible"]', cmd.deductible).catch(() => {});
      }

    } else if (pt === 'GL') {
      if (cmd.eachOccurrence) await page.fill('input[name="EachOccurrence"]', cmd.eachOccurrence);
      if (cmd.damageToRentedPremises) await page.fill('input[name="DamageToRentedPremises"]', cmd.damageToRentedPremises);
      if (cmd.medExp) await page.fill('input[name="MedExp"]', cmd.medExp);
      if (cmd.personalAdvInjury) await page.fill('input[name="PersonalAdvInjury"]', cmd.personalAdvInjury);
      if (cmd.generalAggregate) await page.fill('input[name="GeneralAggregate"]', cmd.generalAggregate);
      if (cmd.productsCompOpAgg) await page.fill('input[name="ProductsCompOpAgg"]', cmd.productsCompOpAgg);
      if (cmd.deductible) await page.fill('input[name="Deductible"]', cmd.deductible);

    } else if (pt === 'WC') {
      if (cmd.elEachAccident) await page.fill('input[name="ELEachAccident"]', cmd.elEachAccident);
      if (cmd.elDiseaseEaEmployee) await page.fill('input[name="ELDiseaseEaEmployee"]', cmd.elDiseaseEaEmployee);
      if (cmd.elDiseasePolicyLimit) await page.fill('input[name="ELDiseasePolicyLimit"]', cmd.elDiseasePolicyLimit);

    } else if (pt === 'EXL') {
      if (cmd.eachOccurrence) await page.fill('input[name="EachOccurrence"]', cmd.eachOccurrence);
      if (cmd.aggregate) await page.fill('input[name="Aggregate"]', cmd.aggregate);
    }

    await page.click('button[type="submit"], button:text("Save")');
    await waitForSaveConfirmation(page);

    // Update master cert
    await page.click('text=Documents, [data-menu="documents"]');
    await page.click('text=Certificates (Master)');
    await page.waitForLoadState('networkidle');

    const count = await page.locator('tbody tr').count();
    if (count === 0) {
      return fail('UPDATE_LIMIT_DEDUCTIBLE', 'No master certificate found - this is an error.');
    }

    await page.click('button:text("Actions"), .actions-btn');
    await page.click('text=Edit');
    await page.waitForLoadState('networkidle');
    await page.click('button[type="submit"], button:text("Save")');
    await waitForSaveConfirmation(page);

    return ok('UPDATE_LIMIT_DEDUCTIBLE', `Limits/deductibles updated for ${cmd.policyType}.`);
  } catch (err) {
    return fail('UPDATE_LIMIT_DEDUCTIBLE', (err as Error).message, err as Error);
  }
}
