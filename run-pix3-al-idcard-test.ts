import 'dotenv/config';
import { addPolicy } from './src/actions/addPolicy';
import { createIDCardForExistingVehicle } from './src/actions/addVehicle';
import { buildInsuredUrl } from './src/actions/_base';
import { AddPolicyCommand } from './src/types';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

const INSURED_ID = 'fbe0ee81-a7b4-4bcc-b0d5-6249b0ca5683';
const VIN = '4V4NC9TG97N436292';
const EFFECTIVE_DATE = '03/05/2026';

function buildPolicyNumber(): string {
  return `ALID6292${Date.now().toString().slice(-6)}`;
}

async function main() {
  const policyNumber = buildPolicyNumber();

  const cmd: AddPolicyCommand = {
    type: 'ADD_POLICY',
    rawText: '',
    policyType: 'AL',
    limit: '$1,000,000',
    carrier: 'Progressive County Mutual Insurance Company',
    mga: 'Progressive County Mutual Insurance Company',
    policyNumber,
    effectiveDate: EFFECTIVE_DATE,
    expirationDate: '03/05/2027',
    scheduledAutos: true,
  };

  logger.info(`=== PIX TEST 3 AL + ID CARD (${policyNumber}) ===`);

  const page = await getNowCertsPage();
  const insuredUrl = buildInsuredUrl(INSURED_ID, 'Information');
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.goto(insuredUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (!page.url().includes(`/AMSINS/Insureds/Details/${INSURED_ID}/`)) {
    await page.goto(insuredUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  }

  logger.info(`Current page before addPolicy: ${page.url()}`);

  const policyResult = await addPolicy(page, cmd);
  logger.info(`ADD_POLICY: ${policyResult.success ? 'OK' : 'FAIL'} - ${policyResult.message}`);
  if (!policyResult.success) {
    await closeBrowser();
    process.exit(1);
  }

  const file = await createIDCardForExistingVehicle(page, VIN, EFFECTIVE_DATE, policyNumber);
  if (!file) {
    logger.error('ID Card flow failed');
    await closeBrowser();
    process.exit(1);
  }

  logger.info(`ID Card downloaded: ${file}`);
  await closeBrowser();
}

main().catch(async (err) => {
  logger.error(`Fatal error: ${err.message}`);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
