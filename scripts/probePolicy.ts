/**
 * PROBE READ-ONLY — dropdown "Lines of Business" del form de alta de póliza.
 * Navega Policies -> Add New, abre el LOB y vuelca TODAS las opciones (y filtradas por
 * "Commercial"). NO guarda (nunca toca Save). Uso: HEADLESS=true npx ts-node scripts/probePolicy.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { getNowCertsPage } from '../src/browser/nowcertsLogin';
import { closeBrowser } from '../src/browser/browserManager';
import { buildInsuredUrl } from '../src/actions/_base';

const INSURED_ID = '55c82b02-351c-490c-a22e-205482e085cd';
const POLICY_ADD_NEW = 'a[href*="Policies/Insert.aspx"][href*="TruckingCompanyId"]';
const LOB_INPUT = '#ctl00_ContentPlaceHolder1_FormView1_ctl01_ctl23___LinesOfBusinessAndFees_rptLinesOfBusiness_ctl00_usrLineOfBusiness_ddlLineOfBusinesses_Input';
const OUT = path.resolve('./probe-out');
function dump(n: string, c: string) { if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, n), c); console.log(`[dump] ${n}`); }

async function main() {
  const page = await getNowCertsPage();
  await page.goto(buildInsuredUrl(INSURED_ID, 'Policies'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const addNew = page.locator(POLICY_ADD_NEW).first();
  const cnt = await addNew.count();
  console.log('addNew count', cnt);
  if (cnt > 0) {
    const href = await addNew.getAttribute('href');
    const abs = href && href.startsWith('http') ? href : new URL(href || '', page.url()).toString();
    await page.goto(abs, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForURL('**/Policies/Insert.aspx**', { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  console.log('insert url:', page.url());
  await page.screenshot({ path: path.join(OUT, 'POL_insert.png'), fullPage: true }).catch(() => {});

  const lob = page.locator(LOB_INPUT).first();
  const lobExists = await lob.count();
  console.log('LOB_INPUT exists:', lobExists);

  const ddSel = LOB_INPUT.replace('_Input', '_DropDown');
  const readOptions = async () => page.evaluate((sel: string) => {
    const doc = (globalThis as any).document;
    const dd = doc.querySelector(sel);
    if (!dd) return 'NO DROPDOWN';
    const items = Array.from(dd.querySelectorAll('li')).map((li: any) => (li.textContent || '').trim()).filter(Boolean);
    return items.join(' | ');
  }, ddSel);

  if (lobExists > 0) {
    // Abrir sin filtrar
    await lob.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    dump('POL_lob_all.txt', String(await readOptions()));
    // Filtrar por "Commercial"
    await lob.fill('Commercial').catch(() => {});
    await page.waitForTimeout(1500);
    dump('POL_lob_commercial.txt', String(await readOptions()));
    // Filtrar por "Auto"
    await lob.fill('Auto').catch(() => {});
    await page.waitForTimeout(1500);
    dump('POL_lob_auto.txt', String(await readOptions()));
  }

  // Volcar TODOS los ids relevantes del form (para confirmar el shift ctl23 -> ctl24)
  const ids = await page.evaluate(() => {
    const doc = (globalThis as any).document;
    const all = Array.from(doc.querySelectorAll('[id]')) as any[];
    return all.map((e: any) => e.id)
      .filter((id: string) => /ddlLineOfBusinesses|usrPolicyCoverages|LimitLiabilityCSL|ddlCoveragesSections|lnkAddNew|LinesOfBusinessAndFees|CombinedSingle|automobileLiability|generalLiability/i.test(id))
      .sort();
  });
  dump('POL_all_ids.txt', (ids as string[]).join('\n'));

  await closeBrowser().catch(() => {});
  process.exit(0);
}
main().catch((e) => { console.error('fatal', e); process.exit(1); });
