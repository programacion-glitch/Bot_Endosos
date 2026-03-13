import 'dotenv/config';
import { parseEmail } from './src/email/emailParser';
import { dispatchCommands } from './src/actions/dispatcher';
import { buildInsuredUrl } from './src/actions/_base';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

// Insured created in latest full run
const INSURED_ID = '7f85950e-5d04-422f-ba66-3c0444eeee29';

const testBody = `Add Vehicle: VIN# 4V4NC9TG97N436292 // Year: 2007 // Description: VOLVO // Effective Date: 03/05/2026`;

const raw = {
  uid: 2001,
  subject: 'DOCUMENTAR CLIENTE // PIX TEST 3 LLC // EFFECTIVE DATE 03/05/2026 // USDOT 11111',
  from: 'test@h2oins.com',
  to: 'bot@h2oins.com',
  body: testBody,
  date: new Date(),
};

async function main() {
  logger.info('=== RETRY PIX TEST 3 TRUCK ===');

  const email = parseEmail(raw);
  const page = await getNowCertsPage();
  await page.goto(buildInsuredUrl(INSURED_ID, 'Information'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const results = await dispatchCommands(page, email);

  logger.info('\n=== RETRY RESULTS ===');
  for (const r of results) {
    const status = r.success ? 'OK' : 'FAIL';
    logger.info(`  ${status} [${r.commandType}] ${r.message}`);
  }

  await closeBrowser();
}

main().catch(async (err) => {
  logger.error(`Fatal error: ${err.message}`);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
