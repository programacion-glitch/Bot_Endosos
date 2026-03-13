import 'dotenv/config';
import { parseEmail } from './src/email/emailParser';
import { dispatchCommands } from './src/actions/dispatcher';
import { buildInsuredUrl } from './src/actions/_base';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

const INSURED_ID = 'fbe0ee81-a7b4-4bcc-b0d5-6249b0ca5683';

const testBody = `Add Policy:
MTC
Limit: $100,000
Deductible: $1,000
Carrier: Hamilton Insurance Designated Activity Company
MGA: XPT Partners LLC
Policy Number: Fake2-34354
Effective Date: 03/05/2026
Expiration Date: 03/05/2027

Add Policy
WC
Carrier: Timber Creek Casualty Insurance Company, Inc.
MGA: INVO
Policy Number: Fake-333111
Effective Date: 03/05/2026
Expiration Date: 03/05/2027
E.L. Each Accident: $500,000
E.L. Disease - EA Employee: $500,000
E.L. Disease - Policy Limit: $500,000`;

const raw = {
  uid: 1003,
  subject: 'DOCUMENTAR CLIENTE // PIX TEST 3 LLC // EFFECTIVE DATE 03/05/2026 // USDOT 11111',
  from: 'test@h2oins.com',
  to: 'bot@h2oins.com',
  body: testBody,
  date: new Date(),
};

async function main() {
  logger.info('=== RETRY PIX TEST 3 MTC/WC ===');

  const email = parseEmail(raw);
  const page = await getNowCertsPage();
  await page.goto(buildInsuredUrl(INSURED_ID, 'Information'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const results = await dispatchCommands(page, email);

  logger.info('\n=== RETRY RESULTS ===');
  for (const r of results) {
    const status = r.success ? 'OK' : 'FAIL';
    logger.info(`  ${status}  [${r.commandType}] ${r.message}`);
  }

  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  logger.info(`\nTotal: ${ok} succeeded, ${fail} failed out of ${results.length}`);

  await closeBrowser();
}

main().catch(async err => {
  logger.error(`Fatal error: ${err.message}`);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
