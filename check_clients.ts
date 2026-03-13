import 'dotenv/config';
import { getNowCertsPage } from './src/browser/nowcertsLogin';
import { closeBrowser } from './src/browser/browserManager';
import { logger } from './src/utils/logger';

async function main() {
  const page = await getNowCertsPage();
  
  await page.goto('https://www8.nowcerts.com/AMSINS/Insureds/List', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  
  // click search by name
  await page.fill('#txtName', 'Pix Test');
  await page.click('#btnSearch');
  await page.waitForTimeout(3000);
  
  const rows = await page.locator('table tbody tr').allTextContents();
  logger.info("Found rows:\n" + rows.join('\n'));

  // Also extract links
  const links = await page.locator('table tbody tr a').evaluateAll(elements => 
    elements.map(el => ({ text: el.textContent, href: (el as HTMLAnchorElement).href }))
  );
  logger.info("Links:\n" + JSON.stringify(links, null, 2));
  
  await closeBrowser();
}

main().catch(async (e) => {
  logger.error(e);
  await closeBrowser();
});
