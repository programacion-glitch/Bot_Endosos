import 'dotenv/config';
import { addPolicy } from './src/actions/addPolicy';
import { buildInsuredUrl } from './src/actions/_base';
import { AddPolicyCommand } from './src/types';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

const INSURED_ID = 'fbe0ee81-a7b4-4bcc-b0d5-6249b0ca5683';

function buildPolicyNumber(): string {
  return `WCVAL${Date.now().toString().slice(-6)}`;
}

async function main() {
  const policyNumber = buildPolicyNumber();

  const cmd: AddPolicyCommand = {
    type: 'ADD_POLICY',
    rawText: '',
    policyType: 'WC',
    carrier: 'Timber Creek Casualty Insurance Company, Inc.',
    mga: 'INVO',
    policyNumber,
    effectiveDate: '03/05/2026',
    expirationDate: '03/05/2027',
    elEachAccident: '$500,000',
    elDiseaseEaEmployee: '$500,000',
    elDiseasePolicyLimit: '$500,000',
  };

  logger.info(`=== PIX TEST 3 WC VALIDATION (${policyNumber}) ===`);
  const page = await getNowCertsPage();
  const insuredUrl = buildInsuredUrl(INSURED_ID, 'Information');
  await page.goto(insuredUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const result = await addPolicy(page, cmd);
  logger.info(`ADD_POLICY: ${result.success ? 'OK' : 'FAIL'} - ${result.message}`);
  if (!result.success) {
    await closeBrowser();
    process.exit(1);
  }

  await page.goto(buildInsuredUrl(INSURED_ID, 'Policies'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const summary = await page.evaluate((num) => {
    const doc = (globalThis as any).document;
    const rows = Array.from(doc.querySelectorAll('table tbody tr'));
    for (const row of rows as any[]) {
      const text = (row.textContent || '').trim().replace(/\s+/g, ' ');
      if (!text.includes(num)) continue;
      const cells = Array.from(row.querySelectorAll('td')).map((cell: any) => (cell.textContent || '').trim().replace(/\s+/g, ' '));
      return {
        policyNumber: cells[4] || '',
        lineOfBusiness: cells[7] || '',
        status: cells[8] || '',
      };
    }
    return null;
  }, policyNumber);

  logger.info(`ROW: ${JSON.stringify(summary)}`);
  await closeBrowser();
}

main().catch(async (err) => {
  logger.error(`Fatal error: ${err.message}`);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
