import 'dotenv/config';
import { addPolicy } from './src/actions/addPolicy';
import { buildInsuredUrl } from './src/actions/_base';
import { AddPolicyCommand } from './src/types';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

const INSURED_ID = 'd9fd4e2c-0d62-411f-8c6c-4f2431fb6783'; // PIX TEST 3 LLC 2026-2027

function buildPolicyNumber(): string {
  return `NTLSTEP10${Date.now().toString().slice(-6)}`;
}

async function main() {
  const policyNumber = buildPolicyNumber();

  const cmd: AddPolicyCommand = {
    type: 'ADD_POLICY',
    rawText: '',
    policyType: 'NTL',
    limit: '$1,000,000',
    carrier: 'Progressive County Mutual Insurance Company',
    mga: 'Progressive County Mutual Insurance Company',
    policyNumber,
    effectiveDate: '03/05/2026',
    expirationDate: '03/05/2027',
    scheduledAutos: true,
  };

  logger.info(`=== NTL STEP 10 VALIDATION (${policyNumber}) ===`);
  const page = await getNowCertsPage();
  await page.goto(buildInsuredUrl(INSURED_ID, 'Information'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const result = await addPolicy(page, cmd);
  logger.info(`ADD_POLICY: ${result.success ? 'OK' : 'FAIL'} - ${result.message}`);

  await closeBrowser();
  if (!result.success) process.exit(1);
}

main().catch(async (err) => {
  logger.error(`Fatal error: ${err.message}`);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
