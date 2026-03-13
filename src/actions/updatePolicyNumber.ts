import { Page } from 'playwright';
import { UpdatePolicyNumberCommand, ActionResult } from '../types';
import { logger } from '../utils/logger';
import { ok, fail, getInsuredUrl, buildNowCertsUrl } from './_base';

const LINE_LABELS: Record<string, string> = {
  AL: 'Commercial Auto',
  MTC: 'Motor Truck Cargo',
  APD: 'Physical Damage',
  GL: 'General Liability',
  WC: "Worker's Compensation",
  EXL: 'Excess Liability',
  NTL: 'Commercial Auto',
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolvePolicyEditUrl(page: Page, policyLabel: string): Promise<string> {
  const row = page.locator('table tbody tr').filter({ hasText: new RegExp(escapeRegex(policyLabel), 'i') }).first();
  if (await row.count() === 0) {
    throw new Error(`Policy row not found for ${policyLabel}`);
  }

  const link = row.locator('a.grid-link[href*="/AMSINS/Policies/Details/"]').first();
  const href = await link.getAttribute('href');
  if (!href) {
    throw new Error(`Policy details link not found for ${policyLabel}`);
  }

  const match = href.match(/\/AMSINS\/Policies\/Details\/([^/]+)\/Information/i);
  if (!match?.[1]) {
    throw new Error(`Policy id not found in link: ${href}`);
  }

  const policyId = match[1];
  return buildNowCertsUrl(`/Policies/Edit.aspx?Id=${policyId}`);
}

async function saveMaster(page: Page): Promise<void> {
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

  await frame.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').click({ force: true }).catch(async () => {
    await frame.locator('#ctl00_ContentPlaceHolder1_btnUpdate_input').evaluate((el: any) => el.click());
  });
  await page.waitForTimeout(5000);
}

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

    const editUrl = await resolvePolicyEditUrl(page, policyLabel);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    await page.locator('#ContentPlaceHolder1_FormView1_ctl01_ctl00___Number_TextBox1').fill(cmd.newPolicyNumber);
    await page.locator('#btnUpdateGlobalPolicies').click({ force: true });
    await page.waitForTimeout(5000);

    await page.goto(getInsuredUrl(page, 'Certificates'), {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(2000);
    await saveMaster(page);

    return ok('UPDATE_POLICY_NUMBER', `Policy number updated to ${cmd.newPolicyNumber} for ${cmd.policyType}.`);
  } catch (err) {
    return fail('UPDATE_POLICY_NUMBER', (err as Error).message, err as Error);
  }
}
