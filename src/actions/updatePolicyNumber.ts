import { Page } from 'playwright';
import { UpdatePolicyNumberCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, buildInsuredUrl, getInsuredIdFromUrl, LINE_LABELS } from './_base';
import { resolvePolicyEditUrl, saveMaster } from './_policyHelpers';

/**
 * UPDATE POLICY NUMBER
 * 1. Find the policy row by requested policy type
 * 2. Open stable policy edit route
 * 3. Update policy number
 * 4. Save
 * 5. Open master certificate and save edit
 */
export async function updatePolicyNumber(
  page: Page,
  cmd: UpdatePolicyNumberCommand
): Promise<ActionResult> {
  logger.info(`updatePolicyNumber: ${cmd.policyType} -> ${cmd.newPolicyNumber}`);

  try {
    const policyLabel = LINE_LABELS[cmd.policyType];
    if (!policyLabel) {
      throw new Error(`Unsupported policy type for updatePolicyNumber: ${cmd.policyType}`);
    }

    const insuredId = getInsuredIdFromUrl(page);

    const editUrl = await resolvePolicyEditUrl(page, insuredId, policyLabel);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await page.locator('#ContentPlaceHolder1_FormView1_ctl01_ctl00___Number_TextBox1').fill(cmd.newPolicyNumber);
    await page.locator('#btnUpdateGlobalPolicies').click({ force: true });
    await page.waitForTimeout(5000);

    await page.goto(buildInsuredUrl(insuredId, 'Certificates'), {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);
    await saveMaster(page, true);

    return ok('UPDATE_POLICY_NUMBER', `Policy number updated to ${cmd.newPolicyNumber} for ${cmd.policyType}.`);
  } catch (err) {
    return fail('UPDATE_POLICY_NUMBER', (err as Error).message, err as Error);
  }
}
