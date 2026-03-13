import 'dotenv/config';
import { parseEmail } from './src/email/emailParser';
import { dispatchCommands } from './src/actions/dispatcher';
import { buildInsuredUrl } from './src/actions/_base';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

const INSURED_ID = 'd9fd4e2c-0d62-411f-8c6c-4f2431fb6783';

const testBody = `Add Policy:

GL

Each Occurrence: $1,000,000

Damage to Rented Premises: $100,000

Med Exp: $5,000

Personal & Adv Injury: $10,000

General Aggregate: $2,000,000

Products-Comp / Op Agg: Included

Deductible: $1,500

Carrier: United States Liability Insurance Company

MGA: XPT Partners LLC

Policy Number: TBD

Effective Date: 03/26/2026

Expiration Date: 03/01/2027


Add Additional Insured to the GL:
Holder’s name: Archer Cargo

Holder’s Address: 106 Stephen Suite LL1, Lemont, Illinois, 6043



Add Waiver of Subrogation to the WC:

Holder’s name: O&M Brokerage c/o Registry Monitoring Insurance Services, Inc.

Holder’s Address: 2261 Market Street, PMB 85402, San Francisco, California, 94114



Add Waiver of Subrogation to the GL & WC:

Holder’s name: ACAVE & Sons Companies Inc

Holder’s Address: PO Box 100928, San Antonio, Texas, 78201



Add Additional Insured & Waiver of Subrogation to the GL:

Holder’s name: Murphy Ready Auto Transport Service

Holder’s Address: 43000 Hwy 160, Theodosia, Missouri, 65761

Note: This is a note test for AI & WOS`;

const raw = {
  uid: 3001,
  subject: 'END-BOT // PIX TEST 3 LLC // USDOT 11111',
  from: 'test@h2oins.com',
  to: 'bot@h2oins.com',
  body: testBody,
  date: new Date(),
};

async function main() {
  logger.info('=== RUN PIX TEST 3 GL + AI/WOS ===');

  const email = parseEmail(raw);
  logger.info(`Commands parsed: ${email.commands.length}`);
  for (const cmd of email.commands) {
    logger.info(`  -> ${cmd.type}`);
  }

  const page = await getNowCertsPage();
  await page.goto(buildInsuredUrl(INSURED_ID, 'Information'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const results = await dispatchCommands(page, email);

  logger.info('\n=== RESULTS ===');
  for (const r of results) {
    const status = r.success ? 'OK' : 'FAIL';
    logger.info(`  ${status} [${r.commandType}] ${r.message}`);
    if (r.downloadedFiles?.length) {
      for (const file of r.downloadedFiles) {
        logger.info(`    file: ${file}`);
      }
    }
  }

  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  logger.info(`\nTotal: ${ok} succeeded, ${fail} failed out of ${results.length}`);

  await closeBrowser();
}

main().catch(async (err) => {
  logger.error(`Fatal error: ${err.message}`);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
