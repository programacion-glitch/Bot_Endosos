import 'dotenv/config';
import { parseEmail } from './src/email/emailParser';
import { dispatchCommands } from './src/actions/dispatcher';
import { getNowCertsPage, navigateToClient } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

const testBody = `Add Policy:
APD

Deductible: $2,500

Carrier: Progressive County Mutual Insurance Company

MGA: Progressive County Mutual Insurance Company

Policy Number: 545646455fake

Effective Date: 3/11/2026

Expiration Date: 6/25/2026



Update Vehicle's value:

Vin#: 4V4NC9TG97N436292

Value: $25,000 Test Text about Attached equipment


Add Loss Payee to VIN# 4V4NC9TG97N436292

Holder's name: BMO Bank N.A. ISAOA

Holder's Address: P.O. Box 35704, Billings MT 59107



Update mailing address:
P.O. Box 1234, Houston, TX, 54785

Add Policy:

MTC

Limit: $250,000

Deductible: $5,000

Carrier: Palomar Excess and Surplus Lines Insurance Company

MGA: Rocklake Insurance Group Inc.

Policy Number: 99784Fake1

Effective Date: 03/11/2026

Expiration Date: 03/11/2027



Add Policy:

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

Effective Date: 03/21/2026

Expiration Date: 03/21/2027


Add Policy:
WC

E.L. Each Accident: $500,000

E.L. Disease - EA Employee: $1,000,000

E.L. Disease - Policy Limit: $600,000

Carrier: Texas Mutual Insurance Company

MGA: Texas Mutual Workers Compensation Insurance

Policy Number: WC883234IFake-011

Effective Date: 2/28/2026

Expiration Date: 2/28/2027



Add Policy:

EXL

Each Occurrence: $1,000,000
Aggregate: $2,000,000

Carrier: Highlander Specialty Insurance Company

MGA:  XPT Partners LLC

Policy Number: WC883234IFake-011

Effective Date: 3/1/2026

Expiration Date: 3/1/2027


Add Note to Master:

Note: This is a note to master test`;

const raw = {
  uid: 999,
  subject: 'END-BOT // PIX TEST 2 LLC DBA: testing DBA2',
  from: 'test@h2oins.com',
  to: 'bot@h2oins.com',
  body: testBody,
  date: new Date(),
};

async function main() {
  logger.info('=== RUN FULL TEST starting ===');

  const email = parseEmail(raw);

  // Override clientName to match NowCerts DBA
  email.clientName = 'testing DBA2';

  logger.info(`Commands parsed: ${email.commands.length}`);
  for (const cmd of email.commands) {
    logger.info(`  -> ${cmd.type}`);
  }

  let page = await getNowCertsPage();

  // Try standard navigation first, fallback to first search result
  let found = await navigateToClient(page, email.clientName, email.usdot);

  if (!found) {
    logger.warn(`Exact match failed — trying first result in Global Search...`);
    const { buildNowCertsUrl } = await import('./src/actions/_base');
    await page.goto(buildNowCertsUrl('/AMSINS/DashboardLight'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('#navigationSearchTermInput').first();
    const searchIcon = page.locator('span.mdi.mdi-magnify[title="Search"]').first();
    await searchInput.click({ force: true });
    await searchInput.fill(email.clientName!);
    await page.waitForTimeout(300);
    await searchIcon.click({ force: true });
    await page.waitForURL('**/GlobalSearch/List?name=*', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Click the first insured profile link
    const firstResult = page.locator('a[href*="/AMSINS/Insureds/Details/"]').first();
    if (await firstResult.count() > 0) {
      await firstResult.click();
      await page.waitForURL('**/AMSINS/Insureds/Details/*/Information', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      found = page.url().includes('/AMSINS/Insureds/Details/');
      if (found) logger.info(`Client found via first-result fallback: ${page.url()}`);
    }
  }

  if (!found) {
    logger.error(`Client not found in NowCerts: "${email.clientName}"`);
    await closeBrowser();
    process.exit(1);
  }

  logger.info('Client found — dispatching commands...');
  const results = await dispatchCommands(page, email);

  logger.info('\n=== RESULTS ===');
  for (const r of results) {
    const status = r.success ? '✓ OK' : '✗ FAIL';
    logger.info(`  ${status}  [${r.commandType}] ${r.message}`);
  }

  const ok = results.filter(r => r.success).length;
  const fail = results.filter(r => !r.success).length;
  logger.info(`\nTotal: ${ok} succeeded, ${fail} failed out of ${results.length}`);

  await closeBrowser();
}

main().catch(err => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
