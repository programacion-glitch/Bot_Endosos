import 'dotenv/config';
import { parseEmail } from './src/email/emailParser';
import { dispatchCommands } from './src/actions/dispatcher';
import { buildInsuredUrl } from './src/actions/_base';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

const INSURED_ID = 'fbe0ee81-a7b4-4bcc-b0d5-6249b0ca5683';

const testBody = `Add Vehicle: VIN# 4V4NC9TG97N436292 // Year: 2007 // Description: VOLVO // Effective Date: 03/05/2026

Add Trailer: VIN# 1GR1P0624MJ318153 // Year: 2021 // Description: GREAT // Effective Date: 03/05/2026`;

const raw = {
  uid: 1004,
  subject: 'DOCUMENTAR CLIENTE // PIX TEST 3 LLC // EFFECTIVE DATE 03/05/2026 // USDOT 11111',
  from: 'test@h2oins.com',
  to: 'bot@h2oins.com',
  body: testBody,
  date: new Date(),
};

async function main() {
  logger.info('=== RETRY PIX TEST 3 VEHICLES ===');

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
