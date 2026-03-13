import 'dotenv/config';
import { parseEmail } from './src/email/emailParser';
import { dispatchCommands } from './src/actions/dispatcher';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

const testBody = `Create Insured
Name: Pix Test 3 LLC 2026 - 2027
Address: 123 Estadio Rd, Kathy, Tx, 11111
USDOT: 11111
Driver1: Name: Sergio // Last Name: Corrales // CDL: 333333 TX // DOB: 10/11/1989
Phone: 3333333333
Email: test@h2oins.com

Create Master

Add Policy:
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
E.L. Disease - Policy Limit: $500,000

Add Policy
NTL
Carrier: Progressive County Mutual Insurance Company
MGA: Progressive County Mutual Insurance Company
Policy Number: Fake-5465
Effective Date: 03/05/2026
Expiration Date: 03/05/2027
Limit: $1,000,000
Scheduled Autos

Add Vehicle: VIN# 4V4NC9TG97N436292 // Year: 2007 // Description: VOLVO // Effective Date: 03/05/2026

Add Trailer: VIN# 1GR1P0624MJ318153 // Year: 2021 // Description: GREAT // Effective Date: 03/05/2026`;

const raw = {
  uid: 1001,
  subject: 'DOCUMENTAR CLIENTE // PIX TEST 3 LLC // EFFECTIVE DATE 03/05/2026 // USDOT 11111',
  from: 'test@h2oins.com',
  to: 'bot@h2oins.com',
  body: testBody,
  date: new Date(),
};

async function main() {
  logger.info('=== RUN PIX TEST 3 starting ===');

  const email = parseEmail(raw);

  logger.info(`Commands parsed: ${email.commands.length}`);
  for (const cmd of email.commands) {
    logger.info(`  -> ${cmd.type}`);
  }

  const page = await getNowCertsPage();
  const results = await dispatchCommands(page, email);

  logger.info('\n=== RESULTS ===');
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
